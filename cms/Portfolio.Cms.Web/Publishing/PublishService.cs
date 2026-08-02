using Microsoft.Extensions.Options;
using Portfolio.Cms.Core.Json;
using Portfolio.Cms.Core.Validation;
using Portfolio.Cms.Web.Data;
using Portfolio.Cms.Web.Storage;

namespace Portfolio.Cms.Web.Publishing;

/// <summary>What a publish would do, or did.</summary>
/// <param name="Validation">Always present — warnings are worth showing even on
/// a successful publish.</param>
/// <param name="ChangedFiles">Repo-relative paths that differ from the branch.</param>
/// <param name="CommitSha">Null for a preview, or when nothing changed.</param>
/// <param name="Blocked">True when validation errors stopped the publish.</param>
public sealed record PublishOutcome(
    ValidationResult Validation,
    IReadOnlyList<string> ChangedFiles,
    string? CommitSha = null,
    bool Blocked = false)
{
    public bool HasChanges => ChangedFiles.Count > 0;
}

/// <summary>
/// Turns the current draft into a commit on the branch GitHub Pages builds from.
/// <para>
/// The order here is the whole safety story. Validation runs against the live
/// repository — not a cached copy — because the checks that matter most are
/// about things the CMS cannot see: whether a case still has a 3D hotspot
/// pointing at it, whether a poster exists. Only then is anything written, and
/// only files that actually differ are included, so a publish after an edit to
/// one sentence touches one file.
/// </para>
/// </summary>
public sealed class PublishService(
    ContentStore store,
    GitHubRepository github,
    PosterStore posters,
    CmsDbContext db,
    IOptions<GitHubOptions> options,
    ILogger<PublishService> log)
{
    /// <summary>Works out what a publish would change, without writing anything.</summary>
    public Task<PublishOutcome> PreviewAsync(CancellationToken ct = default) =>
        RunAsync(commit: false, message: null, publishedBy: null, ct);

    /// <summary>Validates, then commits everything that differs.</summary>
    public Task<PublishOutcome> PublishAsync(string message, string? publishedBy, CancellationToken ct = default) =>
        RunAsync(commit: true, message, publishedBy, ct);

    private async Task<PublishOutcome> RunAsync(
        bool commit, string? message, string? publishedBy, CancellationToken ct)
    {
        var content = await store.LoadAsync(ct);

        // Deliberately fetched fresh every time. These facts live in files the
        // CMS doesn't own — src/scene/framing.ts, public/posters — and a stale
        // copy would let through exactly the deletions the validator exists to
        // catch.
        var facts = await github.GetFactsAsync();
        var pendingPosters = await posters.GetPendingAsync(ct);

        // A poster staged in blob storage but not yet committed still counts as
        // present, or adding a case and its artwork in one sitting would fail
        // validation for artwork the publish is about to write.
        var factsWithPending = facts with
        {
            PosterSlugs = new HashSet<string>(facts.PosterSlugs.Concat(pendingPosters.Keys), StringComparer.Ordinal),
        };

        var validation = ContentValidator.Validate(content, factsWithPending);
        if (!validation.CanPublish)
        {
            log.LogWarning("Publish blocked: {Summary}", validation.Summary());
            return new PublishOutcome(validation, [], Blocked: true);
        }

        var headSha = await github.GetHeadShaAsync();
        var changes = new List<FileChange>();

        foreach (var (path, rendered) in content.Serialize())
        {
            var remote = await github.TryReadTextAsync(path);
            if (remote == rendered) continue;
            changes.Add(FileChange.OfText(path, rendered));
        }

        foreach (var (slug, bytes) in pendingPosters)
            changes.Add(FileChange.OfBytes($"public/posters/{slug}.jpg", bytes));

        var changedPaths = changes.Select(c => c.Path).Order().ToList();

        if (!commit || changes.Count == 0)
            return new PublishOutcome(validation, changedPaths);

        var sha = await github.CommitAsync(
            changes,
            string.IsNullOrWhiteSpace(message) ? DefaultMessage(changedPaths) : message,
            headSha);

        if (sha is not null)
        {
            db.Publishes.Add(new PublishRecord
            {
                CommitSha = sha,
                Branch = options.Value.Branch,
                PublishedBy = publishedBy,
                ChangedFiles = string.Join('\n', changedPaths),
            });
            await db.SaveChangesAsync(ct);
            await posters.ClearPendingAsync(pendingPosters.Keys, ct);
        }

        return new PublishOutcome(validation, changedPaths, sha);
    }

    /// <summary>
    /// A commit message that says what moved. The repository's own history is
    /// written in plain sentences, so an unexplained "Update content" from a
    /// bot would read as noise next to it.
    /// </summary>
    private static string DefaultMessage(IReadOnlyList<string> paths)
    {
        var names = paths
            .Select(p => p.StartsWith("public/posters/", StringComparison.Ordinal) ? "posters" : Path.GetFileName(p))
            .Distinct()
            .Order()
            .ToList();

        var what = names.Count switch
        {
            1 => names[0],
            2 => $"{names[0]} and {names[1]}",
            _ => $"{string.Join(", ", names.Take(names.Count - 1))} and {names[^1]}",
        };
        return $"Update {what} from the CMS";
    }
}

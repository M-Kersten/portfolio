using System.Text;
using Microsoft.Extensions.Options;
using Octokit;
using Portfolio.Cms.Core.Json;
using Portfolio.Cms.Core.Validation;

namespace Portfolio.Cms.Web.Publishing;

/// <summary>One file to write in a publish. Text and binary are both supported
/// because posters go up the same way the JSON does.</summary>
/// <param name="Path">Repo-relative, forward slashes.</param>
/// <param name="Text">Contents when the file is text; null for binary.</param>
/// <param name="Bytes">Contents when the file is binary; null for text.</param>
public sealed record FileChange(string Path, string? Text, byte[]? Bytes)
{
    public static FileChange OfText(string path, string text) => new(path, text, null);
    public static FileChange OfBytes(string path, byte[] bytes) => new(path, null, bytes);
}

/// <summary>
/// Reads from and writes to the portfolio repository over the GitHub API.
/// <para>
/// The CMS has no checkout — it runs on App Service, where the repository only
/// exists as whatever the API returns. That shapes two things. Validation needs
/// facts the CMS doesn't own (the 3D hotspot slugs, which posters exist), so
/// those are fetched rather than read from disk. And a publish has to be one
/// commit containing every changed file, which means going through the Git data
/// API — blobs, a tree, a commit, a ref update — rather than the contents API,
/// which would produce a separate commit per file and leave the branch broken
/// in between.
/// </para>
/// </summary>
public sealed class GitHubRepository(IOptions<GitHubOptions> options, ILogger<GitHubRepository> log)
{
    private readonly GitHubOptions _options = options.Value;

    private GitHubClient Client() => new(new ProductHeaderValue(_options.UserAgent))
    {
        Credentials = new Credentials(_options.Token),
    };

    private string Owner => _options.Owner;
    private string Name => _options.Repository;
    private string Reference => $"heads/{_options.Branch}";

    /// <summary>Reads one text file at the publish branch's tip.</summary>
    public async Task<string> ReadTextAsync(string path)
    {
        var client = Client();
        var contents = await client.Repository.Content.GetAllContentsByRef(Owner, Name, path, _options.Branch);
        return contents[0].Content;
    }

    /// <summary>
    /// Gathers the repository facts validation depends on: the slugs the 3D
    /// scene references, and what exists under public/.
    /// </summary>
    public async Task<RepoFacts> GetFactsAsync()
    {
        var client = Client();

        var framing = ReadTextAsync("src/scene/framing.ts");
        var signals = ReadTextAsync("src/scene/maquette/signals.tsx");
        await Task.WhenAll(framing, signals);

        var (hotspots, relations) = RepoFacts.ParseScene(framing.Result, signals.Result);

        // One recursive tree read is far cheaper than walking public/ directory
        // by directory, and it is the only way to see the poster list at all.
        var branch = await client.Repository.Branch.Get(Owner, Name, _options.Branch);
        var tree = await client.Git.Tree.GetRecursive(Owner, Name, branch.Commit.Sha);

        var publicFiles = new HashSet<string>(StringComparer.Ordinal);
        var posters = new HashSet<string>(StringComparer.Ordinal);
        foreach (var item in tree.Tree)
        {
            if (item.Type != TreeType.Blob || !item.Path.StartsWith("public/", StringComparison.Ordinal)) continue;
            publicFiles.Add(item.Path["public".Length..]);
            if (item.Path.StartsWith("public/posters/", StringComparison.Ordinal)
                && item.Path.EndsWith(".jpg", StringComparison.OrdinalIgnoreCase))
                posters.Add(Path.GetFileNameWithoutExtension(item.Path));
        }

        if (tree.Truncated)
            log.LogWarning("The repository tree came back truncated; poster and asset checks may be incomplete.");

        return new RepoFacts(hotspots, relations, posters, publicFiles);
    }

    /// <summary>Reads every content file at the branch tip, for seeding the draft store.</summary>
    public async Task<Dictionary<string, string>> ReadContentFilesAsync()
    {
        var reads = ContentFile.All.ToDictionary(f => f.RelativePath, f => ReadTextAsync(f.RelativePath));
        await Task.WhenAll(reads.Values);
        return reads.ToDictionary(p => p.Key, p => p.Value.Result);
    }

    /// <summary>
    /// Commits <paramref name="changes"/> in a single commit and moves the
    /// branch to it.
    /// </summary>
    /// <param name="expectedHeadSha">The commit the caller believed was at the
    /// tip. When it no longer is, the push is abandoned rather than silently
    /// overwriting whatever landed in between.</param>
    /// <returns>The new commit's SHA, or null when nothing needed changing.</returns>
    public async Task<string?> CommitAsync(
        IReadOnlyCollection<FileChange> changes, string message, string? expectedHeadSha = null)
    {
        if (changes.Count == 0) return null;

        var client = Client();
        var head = await client.Git.Reference.Get(Owner, Name, Reference);

        if (expectedHeadSha is not null && head.Object.Sha != expectedHeadSha)
            throw new PublishConflictException(expectedHeadSha, head.Object.Sha, _options.Branch);

        var baseCommit = await client.Git.Commit.Get(Owner, Name, head.Object.Sha);

        // Built on the existing tree, so files the CMS doesn't own are carried
        // over untouched rather than deleted.
        var tree = new NewTree { BaseTree = baseCommit.Tree.Sha };
        foreach (var change in changes)
        {
            var blob = change.Text is not null
                ? new NewBlob { Content = change.Text, Encoding = EncodingType.Utf8 }
                : new NewBlob { Content = Convert.ToBase64String(change.Bytes!), Encoding = EncodingType.Base64 };

            var created = await client.Git.Blob.Create(Owner, Name, blob);
            tree.Tree.Add(new NewTreeItem
            {
                Path = change.Path,
                Mode = "100644",
                Type = TreeType.Blob,
                Sha = created.Sha,
            });
        }

        var newTree = await client.Git.Tree.Create(Owner, Name, tree);
        var commit = new NewCommit(message, newTree.Sha, head.Object.Sha)
        {
            Author = new Committer(_options.CommitAuthorName, _options.CommitAuthorEmail, DateTimeOffset.UtcNow),
        };

        var created2 = await client.Git.Commit.Create(Owner, Name, commit);
        await client.Git.Reference.Update(Owner, Name, Reference, new ReferenceUpdate(created2.Sha));

        log.LogInformation("Published {Count} file(s) to {Branch} as {Sha}",
            changes.Count, _options.Branch, created2.Sha[..7]);
        return created2.Sha;
    }

    /// <summary>The commit currently at the branch tip.</summary>
    public async Task<string> GetHeadShaAsync() =>
        (await Client().Git.Reference.Get(Owner, Name, Reference)).Object.Sha;

    /// <summary>Reads a text file, returning null when it isn't there.</summary>
    public async Task<string?> TryReadTextAsync(string path)
    {
        try { return await ReadTextAsync(path); }
        catch (NotFoundException) { return null; }
    }

    /// <summary>Convenience for building a UTF-8 change from rendered content.</summary>
    public static FileChange Text(string path, string content) =>
        FileChange.OfText(path, content);

    /// <summary>Bytes of a text file as the API would store them.</summary>
    public static byte[] Utf8(string content) => Encoding.UTF8.GetBytes(content);
}

/// <summary>
/// Thrown when the branch moved between the CMS reading it and trying to write.
/// Publishing anyway would silently discard whatever landed in between — likely
/// a hand edit, since the repository is still edited directly.
/// </summary>
public sealed class PublishConflictException(string expected, string actual, string branch)
    : Exception($"{branch} has moved on: expected {expected[..7]} but found {actual[..7]}. "
                + "Reload the draft against the new tip before publishing again.")
{
    public string ExpectedSha { get; } = expected;
    public string ActualSha { get; } = actual;
}

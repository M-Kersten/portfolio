using Microsoft.EntityFrameworkCore;
using Portfolio.Cms.Core.Json;
using Portfolio.Cms.Core.Models;

namespace Portfolio.Cms.Web.Data;

/// <summary>
/// Moves a whole <see cref="ContentSet"/> between the draft database and the
/// rest of the application.
/// <para>
/// Everything works on the complete set rather than a file at a time, because
/// the rules that matter are cross-file: cv.nl.json's career overrides are
/// matched positionally against site.json's career list, and `follows` links
/// are resolved across every case at once. Validating or publishing a fragment
/// could not check either.
/// </para>
/// </summary>
public sealed class ContentStore(CmsDbContext db)
{
    /// <summary>Reads the current draft.</summary>
    public async Task<ContentSet> LoadAsync(CancellationToken ct = default)
    {
        var cases = await db.Cases.OrderBy(c => c.Position).AsNoTracking().ToListAsync(ct);
        var documents = await db.Documents.AsNoTracking().ToDictionaryAsync(d => d.Key, d => d.Json, ct);

        T Doc<T>(DocumentKey key) => documents.TryGetValue(key, out var json)
            ? ContentJson.Deserialize<T>(json)
            : throw new InvalidOperationException(
                $"The {key} document is missing from the draft store. Run an import to seed it from the repository.");

        return new ContentSet
        {
            Cases = [.. cases.Select(c => c.ToModel())],
            Capabilities = Doc<List<Capability>>(DocumentKey.Capabilities),
            Site = Doc<SiteContent>(DocumentKey.Site),
            Cv = Doc<CvContent>(DocumentKey.Cv),
            CvNl = Doc<CvContent>(DocumentKey.CvNl),
        };
    }

    /// <summary>
    /// Replaces the whole draft. Cases are matched on slug so that editing one
    /// keeps its row — and its identity — rather than being deleted and
    /// reinserted, which would churn the surrogate keys on every save.
    /// </summary>
    public async Task SaveAsync(ContentSet content, CancellationToken ct = default)
    {
        var existing = await db.Cases.ToDictionaryAsync(c => c.Slug, ct);

        for (var i = 0; i < content.Cases.Count; i++)
        {
            var model = content.Cases[i];
            if (existing.Remove(model.Slug, out var row)) row.Apply(model, i);
            else db.Cases.Add(CaseRecord.From(model, i));
        }

        // Whatever is left was not in the incoming set, so it was deleted.
        db.Cases.RemoveRange(existing.Values);

        await UpsertAsync(DocumentKey.Capabilities, content.Capabilities, ct);
        await UpsertAsync(DocumentKey.Site, content.Site, ct);
        await UpsertAsync(DocumentKey.Cv, content.Cv, ct);
        await UpsertAsync(DocumentKey.CvNl, content.CvNl, ct);

        await db.SaveChangesAsync(ct);
    }

    private async Task UpsertAsync<T>(DocumentKey key, T value, CancellationToken ct)
    {
        var json = System.Text.Json.JsonSerializer.Serialize(value, ContentJson.Options);
        var row = await db.Documents.FindAsync([key], ct);
        if (row is null)
        {
            db.Documents.Add(new DocumentRecord { Key = key, Json = json });
            return;
        }
        // Only stamp UpdatedAt when something actually changed, so the admin's
        // "last edited" doesn't move on a no-op save.
        if (row.Json == json) return;
        row.Json = json;
        row.UpdatedAt = DateTimeOffset.UtcNow;
    }

    /// <summary>True when nothing has been imported yet.</summary>
    public async Task<bool> IsEmptyAsync(CancellationToken ct = default) =>
        !await db.Documents.AnyAsync(ct);

    /// <summary>
    /// Seeds the draft from a checkout. This is how the CMS starts life: the
    /// repository already holds the content, so the first run imports it rather
    /// than asking anyone to retype it.
    /// </summary>
    public Task ImportFromCheckoutAsync(string repoRoot, CancellationToken ct = default) =>
        SaveAsync(ContentSet.LoadFrom(repoRoot), ct);

    /// <summary>The most recent publish, or null if the CMS has never pushed.</summary>
    public Task<PublishRecord?> LastPublishAsync(CancellationToken ct = default) =>
        db.Publishes.OrderByDescending(p => p.PublishedAt).AsNoTracking().FirstOrDefaultAsync(ct);
}

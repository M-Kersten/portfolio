using Azure;
using Azure.Storage.Blobs;
using Azure.Storage.Blobs.Models;

namespace Portfolio.Cms.Web.Storage;

/// <summary>
/// Stages posters in Azure Blob Storage. Nothing here is public — the container
/// is private and the blobs only ever travel from the CMS to a commit, so the
/// artwork the site serves is still the file in the repository.
/// </summary>
public sealed class BlobPosterStore(BlobContainerClient container, ILogger<BlobPosterStore> log) : PosterStore
{
    private static string BlobName(string slug) => $"{slug}.jpg";

    protected override async Task StoreAsync(string slug, byte[] jpeg, CancellationToken ct)
    {
        await container.CreateIfNotExistsAsync(PublicAccessType.None, cancellationToken: ct);
        var blob = container.GetBlobClient(BlobName(slug));
        await blob.UploadAsync(new BinaryData(jpeg), overwrite: true, ct);
        log.LogInformation("Staged poster for {Slug} ({Size:N0} bytes)", slug, jpeg.Length);
    }

    public override async Task<IReadOnlyDictionary<string, byte[]>> GetPendingAsync(CancellationToken ct = default)
    {
        var pending = new Dictionary<string, byte[]>(StringComparer.Ordinal);
        if (!await container.ExistsAsync(ct)) return pending;

        await foreach (var item in container.GetBlobsAsync(cancellationToken: ct))
        {
            var content = await container.GetBlobClient(item.Name).DownloadContentAsync(ct);
            pending[Path.GetFileNameWithoutExtension(item.Name)] = content.Value.Content.ToArray();
        }
        return pending;
    }

    public override async Task ClearPendingAsync(IEnumerable<string> slugs, CancellationToken ct = default)
    {
        foreach (var slug in slugs)
            await container.DeleteBlobIfExistsAsync(BlobName(slug), cancellationToken: ct);
    }

    public override Task DiscardAsync(string slug, CancellationToken ct = default) =>
        container.DeleteBlobIfExistsAsync(BlobName(slug), cancellationToken: ct);
}

/// <summary>
/// Stages posters on disk. Used when no storage connection is configured, so
/// the CMS runs end to end locally without an Azure account — the alternative
/// is that poster upload is the one feature you can't try before deploying.
/// </summary>
public sealed class LocalPosterStore(string directory, ILogger<LocalPosterStore> log) : PosterStore
{
    private string PathFor(string slug) => Path.Combine(directory, $"{slug}.jpg");

    protected override async Task StoreAsync(string slug, byte[] jpeg, CancellationToken ct)
    {
        Directory.CreateDirectory(directory);
        await File.WriteAllBytesAsync(PathFor(slug), jpeg, ct);
        log.LogInformation("Staged poster for {Slug} at {Path}", slug, PathFor(slug));
    }

    public override async Task<IReadOnlyDictionary<string, byte[]>> GetPendingAsync(CancellationToken ct = default)
    {
        var pending = new Dictionary<string, byte[]>(StringComparer.Ordinal);
        if (!Directory.Exists(directory)) return pending;

        foreach (var path in Directory.EnumerateFiles(directory, "*.jpg"))
            pending[Path.GetFileNameWithoutExtension(path)] = await File.ReadAllBytesAsync(path, ct);
        return pending;
    }

    public override Task ClearPendingAsync(IEnumerable<string> slugs, CancellationToken ct = default)
    {
        foreach (var slug in slugs) File.Delete(PathFor(slug));
        return Task.CompletedTask;
    }

    public override Task DiscardAsync(string slug, CancellationToken ct = default)
    {
        if (File.Exists(PathFor(slug))) File.Delete(PathFor(slug));
        return Task.CompletedTask;
    }
}

using ImageMagick;

namespace Portfolio.Cms.Web.Storage;

/// <summary>
/// Holds poster artwork between upload and publish.
/// <para>
/// Posters can't go straight into the repository: a case and its artwork have
/// to arrive in the same commit or the build fails in between — a curated case
/// with no poster is an error, not a warning. So an upload is staged here, the
/// validator counts staged posters as present, and the publish writes them
/// alongside the JSON.
/// </para>
/// </summary>
public abstract class PosterStore
{
    /// <summary>Stages a poster for <paramref name="slug"/>, processing it first.</summary>
    public async Task SaveAsync(string slug, Stream upload, CancellationToken ct = default) =>
        await StoreAsync(slug, await PosterProcessor.ProcessAsync(upload, ct), ct);

    /// <summary>Staged posters, keyed by slug, as the bytes to commit.</summary>
    public abstract Task<IReadOnlyDictionary<string, byte[]>> GetPendingAsync(CancellationToken ct = default);

    /// <summary>Drops staged posters once they are safely committed.</summary>
    public abstract Task ClearPendingAsync(IEnumerable<string> slugs, CancellationToken ct = default);

    /// <summary>Removes one staged poster — an upload undone before publishing.</summary>
    public abstract Task DiscardAsync(string slug, CancellationToken ct = default);

    protected abstract Task StoreAsync(string slug, byte[] jpeg, CancellationToken ct);
}

/// <summary>
/// Resizes and recompresses an uploaded poster to match what
/// scripts/optimize-posters.mjs produces.
/// <para>
/// The numbers are that script's: cards render posters at ~250 CSS px and the
/// focus dialog at ~760, so past ~1024px is dead weight, and camera originals
/// run 1–2MB each. Doing it on upload rather than leaving it to
/// <c>npm run posters</c> matters more here than it does locally — the CMS
/// commits straight to the repository, so an unprocessed original would be
/// permanent history rather than something noticed before staging.
/// </para>
/// <para>
/// Magick.NET rather than ImageSharp: ImageSharp 4 fails the build outright
/// without a paid Six Labors licence key. This is Apache-2.0, and its
/// AutoOrient/Resize/Strip trio maps almost one-to-one onto what sharp does in
/// the existing script.
/// </para>
/// </summary>
public static class PosterProcessor
{
    public const int MaxWidth = 1024;
    public const int Quality = 78;

    public static async Task<byte[]> ProcessAsync(Stream upload, CancellationToken ct = default)
    {
        using var image = new MagickImage();
        await image.ReadAsync(upload, ct);

        // Bake EXIF orientation before stripping the metadata that describes
        // it, or portrait photos come out sideways.
        image.AutoOrient();

        // Never upscale — a poster smaller than the cap is left at its size.
        if (image.Width > MaxWidth)
            image.Resize(new MagickGeometry((uint)MaxWidth, 0) { Greater = true });

        image.Strip();
        image.Quality = Quality;
        image.Format = MagickFormat.Jpeg;

        return image.ToByteArray();
    }
}

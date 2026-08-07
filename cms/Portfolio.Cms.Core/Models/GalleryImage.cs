using System.Text.Json.Serialization;

namespace Portfolio.Cms.Core.Models;

/// <summary>
/// One frame of a case's gallery. Mirrors GalleryImage in src/content/types.ts.
/// <para>
/// <see cref="File"/> is a filename, not a path: the images live in
/// <c>public/gallery/{slug}/</c>, the same slug-derived convention the posters
/// use. That is a rule the CMS has to enforce rather than merely follow —
/// <see cref="Validation.ContentValidator"/> rejects a value containing a
/// separator, because a path here would resolve somewhere neither the validator
/// nor the site's own build check ever looks, and the first sign of it would be
/// a broken image in production.
/// </para>
/// </summary>
public sealed class GalleryImage
{
    [JsonPropertyOrder(1)]
    public required string File { get; set; }

    /// <summary>
    /// Shown under the image in the lightbox and used as its alt text. Absent
    /// means the frame is decorative and gets <c>alt=""</c> — so this is worth
    /// filling in wherever the picture carries information, and worth leaving
    /// off where it doesn't.
    /// </summary>
    [JsonPropertyOrder(2), JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Caption { get; set; }
}

using System.ComponentModel.DataAnnotations;

namespace Portfolio.Cms.Web.Data;

/// <summary>
/// Which singleton document a <see cref="DocumentRecord"/> holds. These four
/// have no collection to list or sort — each is edited as one form and written
/// out as one file — so they are stored whole rather than shredded into tables.
/// Modelling site.json's nested sections as twenty tables would buy nothing and
/// cost every future field a migration.
/// </summary>
public enum DocumentKey
{
    Site,
    Cv,
    CvNl,
    Capabilities,
}

/// <summary>One stored content document, held as the JSON the site expects.</summary>
public class DocumentRecord
{
    [Key]
    public DocumentKey Key { get; set; }

    /// <summary>
    /// The document's current draft, in the site's own JSON shape. Stored
    /// canonically (no layout) — <see cref="Core.Json.ContentWriter"/> applies
    /// the repo's hand-formatting when the file is written at publish time.
    /// </summary>
    public string Json { get; set; } = "";

    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}

/// <summary>
/// Records what the CMS last pushed, so the admin can show whether the draft in
/// the database differs from what is actually live and, on publish, detect that
/// the repository moved underneath it.
/// </summary>
public class PublishRecord
{
    public int Id { get; set; }

    /// <summary>Commit the publish created.</summary>
    [MaxLength(40)] public string CommitSha { get; set; } = "";

    /// <summary>Branch it went to — the one GitHub Pages builds from.</summary>
    [MaxLength(200)] public string Branch { get; set; } = "";

    [MaxLength(200)] public string? PublishedBy { get; set; }

    /// <summary>Files the commit touched, newline separated.</summary>
    public string ChangedFiles { get; set; } = "";

    public DateTimeOffset PublishedAt { get; set; } = DateTimeOffset.UtcNow;
}

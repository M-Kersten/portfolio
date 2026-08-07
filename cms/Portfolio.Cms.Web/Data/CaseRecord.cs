using System.ComponentModel.DataAnnotations;
using System.Text.Json;
using Portfolio.Cms.Core.Json;
using Portfolio.Cms.Core.Models;

namespace Portfolio.Cms.Web.Data;

/// <summary>
/// A case as it is stored. Kept separate from <see cref="CaseStudy"/> — which
/// is the JSON contract with the site and must not grow database concerns like
/// a surrogate key — with explicit mapping between the two.
/// <para>
/// Cases get real columns rather than a JSON blob because they are the one
/// collection the admin lists, sorts and filters. The four singleton documents
/// don't need that and are stored whole; see <see cref="DocumentRecord"/>.
/// </para>
/// </summary>
public class CaseRecord
{
    public int Id { get; set; }

    /// <summary>
    /// Position in cases.json. The order is meaningful — the site renders the
    /// array as authored — so it is stored rather than recovered from a sort.
    /// </summary>
    public int Position { get; set; }

    [MaxLength(100)] public string Slug { get; set; } = "";
    [MaxLength(200)] public string Title { get; set; } = "";
    [MaxLength(200)] public string? Tag { get; set; }
    [MaxLength(10)] public string Layer { get; set; } = "";
    [MaxLength(200)] public string Client { get; set; } = "";
    [MaxLength(50)] public string? Kind { get; set; }
    [MaxLength(200)] public string Sector { get; set; } = "";

    /// <summary>JSON array — a short list of enum values, not worth a join table.</summary>
    public string DisciplineJson { get; set; } = "[]";

    public string Problem { get; set; } = "";
    public string Approach { get; set; } = "";
    public string Outcome { get; set; } = "";

    /// <summary>JSON array, or null when the case lists no stack.</summary>
    public string? TechJson { get; set; }

    public string? Lesson { get; set; }
    [MaxLength(100)] public string? Follows { get; set; }
    [MaxLength(10)] public string? Year { get; set; }
    [MaxLength(500)] public string? Video { get; set; }
    [MaxLength(500)] public string? Article { get; set; }

    /// <summary>
    /// Nullable on purpose: the site treats absent and false identically, and
    /// <see cref="CaseStudy.Archive"/> must stay out of the JSON when unset.
    /// </summary>
    public bool? Archive { get; set; }

    /// <summary>
    /// JSON array of <see cref="GalleryImage"/>, or null when the case has no
    /// gallery. A blob rather than a child table on purpose: the list is short,
    /// ordered, only ever read and written whole, and its order is content (it
    /// is the order the frames appear in), which a relational child table would
    /// force us to reconstruct from a sort column for no gain.
    /// <para>
    /// The schema comes from EnsureCreated, not migrations — see CmsDbContext
    /// on why this database is a draft store and not the source of truth — so a
    /// database created before this field existed needs recreating rather than
    /// upgrading. Nothing is lost by that: the repo is the truth.
    /// </para>
    /// </summary>
    public string? GalleryJson { get; set; }

    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;

    public CaseStudy ToModel() => new()
    {
        Slug = Slug,
        Title = Title,
        Tag = Tag,
        Layer = Enum.Parse<Layer>(Layer, ignoreCase: true),
        Client = Client,
        Kind = Kind,
        Sector = Sector,
        Discipline = JsonSerializer.Deserialize<List<Discipline>>(DisciplineJson, ContentJson.Options) ?? [],
        Problem = Problem,
        Approach = Approach,
        Outcome = Outcome,
        Tech = TechJson is null ? null : JsonSerializer.Deserialize<List<string>>(TechJson, ContentJson.Options),
        Lesson = Lesson,
        Follows = Follows,
        Year = Year,
        Video = Video,
        Article = Article,
        Archive = Archive,
        Gallery = GalleryJson is null ? null : JsonSerializer.Deserialize<List<GalleryImage>>(GalleryJson, ContentJson.Options),
    };

    /// <summary>Copies a model onto this row, leaving <see cref="Id"/> alone so
    /// the same method serves both insert and update.</summary>
    public void Apply(CaseStudy model, int position)
    {
        Position = position;
        Slug = model.Slug;
        Title = model.Title;
        Tag = model.Tag;
        Layer = model.Layer.ToString().ToLowerInvariant();
        Client = model.Client;
        Kind = model.Kind;
        Sector = model.Sector;
        DisciplineJson = JsonSerializer.Serialize(model.Discipline, ContentJson.Options);
        Problem = model.Problem;
        Approach = model.Approach;
        Outcome = model.Outcome;
        TechJson = model.Tech is null ? null : JsonSerializer.Serialize(model.Tech, ContentJson.Options);
        Lesson = model.Lesson;
        Follows = model.Follows;
        Year = model.Year;
        Video = model.Video;
        Article = model.Article;
        Archive = model.Archive;
        GalleryJson = model.Gallery is null ? null : JsonSerializer.Serialize(model.Gallery, ContentJson.Options);
        UpdatedAt = DateTimeOffset.UtcNow;
    }

    public static CaseRecord From(CaseStudy model, int position)
    {
        var record = new CaseRecord();
        record.Apply(model, position);
        return record;
    }
}

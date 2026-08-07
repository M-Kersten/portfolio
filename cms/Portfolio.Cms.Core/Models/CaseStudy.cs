using System.Text.Json.Serialization;

namespace Portfolio.Cms.Core.Models;

/// <summary>
/// One project. Mirrors CaseStudy in src/content/types.ts.
/// <para>
/// The [JsonPropertyOrder] values reproduce the key order that cases.json
/// already uses — which is *not* the declaration order in types.ts (the file
/// puts `outcome` before `lesson`). It was hand-edited and is internally
/// inconsistent, so no single order reproduces all 16 entries byte for byte;
/// this is the majority order, and adopting it reorders keys in 4 cases once.
/// After that every publish diff shows only what actually changed.
/// </para>
/// </summary>
public sealed class CaseStudy
{
    /// <summary>
    /// Stable identity. Referenced by typed-out string from three places the
    /// CMS cannot see — the 3D hotspots (src/scene/framing.ts), the relation
    /// cables (src/scene/maquette/signals.tsx) and the poster file
    /// (public/posters/{slug}.jpg) — so renaming or deleting a slug can break
    /// the site build. ContentValidator guards both directions.
    /// </summary>
    [JsonPropertyOrder(1)]
    public required string Slug { get; set; }

    [JsonPropertyOrder(2)]
    public required string Title { get; set; }

    /// <summary>
    /// Map tag override — a short company/label for the waypoint. Defaults to
    /// <see cref="Client"/>. Ignored when <see cref="Kind"/> is set.
    /// </summary>
    [JsonPropertyOrder(3), JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Tag { get; set; }

    /// <summary>Exactly one layer tag per case (§7 of the build spec).</summary>
    [JsonPropertyOrder(4)]
    public required Layer Layer { get; set; }

    [JsonPropertyOrder(5)]
    public required string Client { get; set; }

    /// <summary>
    /// Flags independent work so the waypoint tag reads "Freelance" / "Passion"
    /// in its own colour instead of a client company. Should be one of
    /// <see cref="CaseKind.Known"/>; kept as a string because the existing
    /// content holds three values that aren't, and the validator warns rather
    /// than refusing to load them. See <see cref="CaseKind"/>.
    /// </summary>
    [JsonPropertyOrder(6), JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Kind { get; set; }

    [JsonPropertyOrder(7)]
    public required string Sector { get; set; }

    /// <summary>At least one — /projects filters on these and a case with an
    /// empty list can never be reached by any filter.</summary>
    [JsonPropertyOrder(8)]
    public List<Discipline> Discipline { get; set; } = [];

    /// <summary>The story, told in three beats — these carry the case dialogs.</summary>
    [JsonPropertyOrder(9)]
    public required string Problem { get; set; }

    [JsonPropertyOrder(10)]
    public required string Approach { get; set; }

    /// <summary>Exactly one hard outcome metric per case — the big summary line.</summary>
    [JsonPropertyOrder(11)]
    public required string Outcome { get; set; }

    /// <summary>Tech stack, shown as tags in the case dialog.</summary>
    [JsonPropertyOrder(12), JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public List<string>? Tech { get; set; }

    /// <summary>
    /// Slug of the earlier case this one builds on. Renders as "← builds on",
    /// and the reverse ("led to →") is derived, so this one field threads the
    /// cases into walkable storylines. Must point at a real slug.
    /// </summary>
    [JsonPropertyOrder(13), JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Follows { get; set; }

    /// <summary>The third beat — optional, but almost always worth it.</summary>
    [JsonPropertyOrder(14), JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Lesson { get; set; }

    /// <summary>
    /// "YYYY" or "YYYY-MM". Required for curated cases — it stamps the wall
    /// tile and places it on the timeline. Optional when <see cref="Archive"/>
    /// is set, since an archive entry reaches neither.
    /// </summary>
    [JsonPropertyOrder(15), JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Year { get; set; }

    /// <summary>A YouTube URL — embedded in the node HUD and map card popup.</summary>
    [JsonPropertyOrder(16), JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Video { get; set; }

    /// <summary>URL to a fuller write-up, linked from the popups.</summary>
    [JsonPropertyOrder(17), JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Article { get; set; }

    /// <summary>
    /// A long-tail project: it appears in the /projects index but is kept off
    /// the curated hero + timeline. Highlights leave this unset — and because
    /// `false` and absent mean the same thing to the site, this stays nullable
    /// so an unset flag never appears in the JSON.
    /// </summary>
    [JsonPropertyOrder(18), JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public bool? Archive { get; set; }

    /// <summary>
    /// Extra frames for a picture-led project — shown as a grid in the case
    /// popup, opening full-size in a lightbox. Null when the case has none;
    /// an empty list would write <c>"gallery": []</c> into the JSON, which the
    /// site's build check rejects, so <see cref="Validation.ContentValidator"/>
    /// treats that as an error rather than letting it publish.
    /// <para>
    /// Last in the key order because it is the newest field and every existing
    /// entry ends before it — which keeps the first publish after this change a
    /// pure addition rather than a reshuffle of all sixteen cases.
    /// </para>
    /// </summary>
    [JsonPropertyOrder(19), JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public List<GalleryImage>? Gallery { get; set; }
}

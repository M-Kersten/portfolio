using System.Text.Json.Serialization;

namespace Portfolio.Cms.Core.Models;

/// <summary>
/// One stint on the career timeline — colours and labels a stretch of the
/// projects-map route. Mirrors CareerEntry in src/content/types.ts.
/// <para>
/// Order matters beyond presentation: cv.nl.json carries a parallel `career`
/// array of translation overrides matched strictly <em>by index</em>. Adding,
/// removing or reordering an entry here without doing the same there breaks
/// the site build, so the two are edited together and the validator checks
/// the lengths agree.
/// </para>
/// </summary>
public sealed class CareerEntry
{
    /// <summary>Short label drawn on the route, e.g. "Wonderment".</summary>
    [JsonPropertyOrder(1)]
    public required string Company { get; set; }

    /// <summary>Start month, "YYYY-MM".</summary>
    [JsonPropertyOrder(2)]
    public required string From { get; set; }

    /// <summary>
    /// End month "YYYY-MM", or null for the current role. Null is meaningful
    /// here and must serialize as an explicit `null` rather than being
    /// omitted — the site reads it to find the ongoing stint.
    /// </summary>
    [JsonPropertyOrder(3)]
    public string? To { get; set; }

    /// <summary>Band colour — kept distinct from the City/Room/Chip palette.</summary>
    [JsonPropertyOrder(4)]
    public required string Color { get; set; }

    /// <summary>
    /// Concurrent freelance / side work: drawn as an overlay below the main
    /// spine rather than taking over the route.
    /// </summary>
    [JsonPropertyOrder(5), JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public bool? Freelance { get; set; }

    [JsonPropertyOrder(6), JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Role { get; set; }

    [JsonPropertyOrder(7), JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Location { get; set; }

    /// <summary>A sentence about the experience — shown in the route tooltip.
    /// The CV falls back to this when <see cref="Detail"/> is absent.</summary>
    [JsonPropertyOrder(8), JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Blurb { get; set; }

    /// <summary>Company website — the route band links here.</summary>
    [JsonPropertyOrder(9), JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Url { get; set; }

    /// <summary>Explicit logo (public/ path). When omitted the tooltip falls
    /// back to the company favicon derived from <see cref="Url"/>.</summary>
    [JsonPropertyOrder(10), JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Logo { get; set; }

    [JsonPropertyOrder(11), JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Sector { get; set; }

    [JsonPropertyOrder(12), JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public List<string>? Tech { get; set; }

    /// <summary>The full CV paragraph for this stint. Site tooltips always use
    /// the short <see cref="Blurb"/>; only the CV reads this.</summary>
    [JsonPropertyOrder(13), JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Detail { get; set; }
}

using System.Text.Json.Serialization;

namespace Portfolio.Cms.Core.Models;

/// <summary>Labels and toolbar strings for one CV language.</summary>
public sealed class CvUi
{
    [JsonPropertyOrder(1)] public required string Profile { get; set; }
    [JsonPropertyOrder(2)] public required string YearsUnit { get; set; }
    [JsonPropertyOrder(3)] public required string Experience { get; set; }
    [JsonPropertyOrder(4)] public required string Education { get; set; }
    [JsonPropertyOrder(5)] public required string Certificates { get; set; }
    [JsonPropertyOrder(6)] public required string Stack { get; set; }
    [JsonPropertyOrder(7)] public required string Languages { get; set; }
    [JsonPropertyOrder(8)] public required string OffTheClockLabel { get; set; }
    [JsonPropertyOrder(9)] public required string Now { get; set; }
    [JsonPropertyOrder(10)] public required string Back { get; set; }
    [JsonPropertyOrder(11)] public required string Download { get; set; }
}

/// <summary>A link in the CV header's quieter row under the location line.</summary>
public sealed class CvLink
{
    [JsonPropertyOrder(1)] public required string Label { get; set; }

    /// <summary>Full URL or a mailto: — bare paths are rejected.</summary>
    [JsonPropertyOrder(2), JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Href { get; set; }
}

public sealed class EducationEntry
{
    [JsonPropertyOrder(1)] public required string School { get; set; }
    [JsonPropertyOrder(2)] public required string Degree { get; set; }

    [JsonPropertyOrder(3), JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Location { get; set; }

    /// <summary>"YYYY-MM" bounds — both required to show a period.</summary>
    [JsonPropertyOrder(4), JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? From { get; set; }

    [JsonPropertyOrder(5), JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? To { get; set; }

    [JsonPropertyOrder(6), JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Note { get; set; }
}

/// <summary>
/// Per-career-entry text override for a non-English CV pack. Matched to
/// site.json's career list <em>by index</em>, so the two lists must stay the
/// same length and order.
/// </summary>
public sealed class CvCareerOverride
{
    [JsonPropertyOrder(1), JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Sector { get; set; }

    [JsonPropertyOrder(2)] public required string Detail { get; set; }
}

/// <summary>
/// One CV language pack — src/content/cv.json (English) and cv.nl.json (Dutch).
/// <para>
/// The work-history <em>structure</em> lives in site.json; a non-English pack
/// only overrides each entry's sector/detail through <see cref="Career"/>.
/// English reads those straight from site.json, which is why
/// <see cref="Career"/> is absent from cv.json and required in cv.nl.json.
/// </para>
/// </summary>
public sealed class CvContent
{
    [JsonPropertyOrder(1)] public required CvUi Ui { get; set; }

    /// <summary>One-line role statement under the name.</summary>
    [JsonPropertyOrder(2)] public required string Tagline { get; set; }

    /// <summary>The "about" paragraph at the top of the CV.</summary>
    [JsonPropertyOrder(3)] public required string Profile { get; set; }

    /// <summary>Head shot (public/ path), shown beside the header.</summary>
    [JsonPropertyOrder(4), JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Photo { get; set; }

    [JsonPropertyOrder(5)] public required string Location { get; set; }

    /// <summary>Display form; the tel: link strips the spaces.</summary>
    [JsonPropertyOrder(6), JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Phone { get; set; }

    [JsonPropertyOrder(7)] public List<CvLink> Links { get; set; } = [];

    /// <summary>Tools and skills list for the extras strip.</summary>
    [JsonPropertyOrder(8)] public List<string> Stack { get; set; } = [];

    [JsonPropertyOrder(9)] public List<EducationEntry> Education { get; set; } = [];

    [JsonPropertyOrder(10), JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public List<string>? Certificates { get; set; }

    [JsonPropertyOrder(11)] public List<string> Languages { get; set; } = [];

    /// <summary>One relaxed line of interests.</summary>
    [JsonPropertyOrder(12)] public required string OffTheClock { get; set; }

    /// <summary>Translation overrides, in site.json's career order. Present on
    /// non-English packs only.</summary>
    [JsonPropertyOrder(13), JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public List<CvCareerOverride>? Career { get; set; }
}

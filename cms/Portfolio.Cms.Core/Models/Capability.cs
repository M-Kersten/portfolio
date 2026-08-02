using System.Text.Json.Serialization;

namespace Portfolio.Cms.Core.Models;

/// <summary>
/// One column of the capabilities band. Mirrors Capability in
/// src/content/types.ts. There are always exactly three of these — one per
/// <see cref="Models.Layer"/> — and the band layout assumes it; the validator
/// enforces the count rather than letting the site render a gap.
/// </summary>
public sealed class Capability
{
    [JsonPropertyOrder(1)]
    public required Layer Layer { get; set; }

    /// <summary>Display index, e.g. "01" — a string so leading zeros survive.</summary>
    [JsonPropertyOrder(2)]
    public required string Index { get; set; }

    [JsonPropertyOrder(3)]
    public required string Title { get; set; }

    [JsonPropertyOrder(4)]
    public required string Body { get; set; }

    [JsonPropertyOrder(5)]
    public List<string> Tags { get; set; } = [];
}

using System.Text.Json.Serialization;

namespace Portfolio.Cms.Core.Models;

/// <summary>
/// One outbound link on a case, with the words that go on its button. Mirrors
/// CaseLink in src/content/types.ts.
/// <para>
/// This replaced a single <c>Article</c> string that the site rendered behind a
/// hardcoded "Read more". One field holds one destination, and several projects
/// have a handful — a write-up, a talk, a press piece, a demo film. The fixed
/// label was also already wrong: two of the thirteen values it held were
/// YouTube URLs sitting under a button that said "Read more".
/// </para>
/// <para>
/// <see cref="Label"/> is authored, never derived. Guessing it from the host
/// gets "medium.com" right and "some-agency.nl/a-thing" wrong, and whoever
/// writes the case already knows what is on the end of the link.
/// </para>
/// </summary>
public sealed class CaseLink
{
    /// <summary>
    /// Absolute http(s) URL. <see cref="Validation.ContentValidator"/> insists
    /// on the protocol: a bare "example.com" reads fine to a human but resolves
    /// against the site's own origin, so the button 404s on your own domain
    /// instead of going where it was meant to.
    /// </summary>
    [JsonPropertyOrder(1)]
    public required string Url { get; set; }

    /// <summary>The button's words, e.g. "Read the write-up", "Watch the talk".</summary>
    [JsonPropertyOrder(2)]
    public required string Label { get; set; }
}

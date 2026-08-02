using System.Text.Json.Serialization;

namespace Portfolio.Cms.Core.Models;

/// <summary>A link in the nav or the contact row.</summary>
public sealed class NavItem
{
    [JsonPropertyOrder(1)] public required string Href { get; set; }
    [JsonPropertyOrder(2)] public required string Label { get; set; }
}

/// <summary>One label/value pair in the about section's fact list.</summary>
public sealed class Fact
{
    [JsonPropertyOrder(1)] public required string Label { get; set; }
    [JsonPropertyOrder(2)] public required string Value { get; set; }
}

/// <summary>
/// The movie-intro title card, shown once on first load as the camera dollies
/// into the maquette. Removing it from <see cref="Hero"/> skips the intro
/// entirely — which is why it is nullable rather than carrying empty strings.
/// </summary>
public sealed class HeroIntro
{
    [JsonPropertyOrder(1)] public required string Title { get; set; }
    [JsonPropertyOrder(2)] public required string Body { get; set; }
}

public sealed class Hero
{
    [JsonPropertyOrder(1)] public required string Name { get; set; }

    /// <summary>Short, first-person subheading. Kept minimal so it stays out
    /// of the 3D's way and can fade when a node is inspected.</summary>
    [JsonPropertyOrder(2)] public required string Subheading { get; set; }

    [JsonPropertyOrder(3), JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public HeroIntro? Intro { get; set; }
}

/// <summary>A titled lead paragraph above a section.</summary>
public sealed class SectionIntro
{
    [JsonPropertyOrder(1), JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Title { get; set; }

    [JsonPropertyOrder(2)] public required string Lead { get; set; }
}

public sealed class AboutSection
{
    [JsonPropertyOrder(1)] public required string Title { get; set; }
    [JsonPropertyOrder(2)] public required string Lead { get; set; }

    /// <summary>Body copy, one string per paragraph.</summary>
    [JsonPropertyOrder(3)] public List<string> Body { get; set; } = [];

    [JsonPropertyOrder(4)] public List<Fact> Facts { get; set; } = [];
}

public sealed class ContactSection
{
    [JsonPropertyOrder(1)] public required string Title { get; set; }
    [JsonPropertyOrder(2)] public required string Lead { get; set; }
    [JsonPropertyOrder(3)] public required string Email { get; set; }

    /// <summary>Each href must be a full URL — the validator rejects bare paths.</summary>
    [JsonPropertyOrder(4)] public List<NavItem> Links { get; set; } = [];
}

/// <summary>
/// Everything in src/content/site.json. Property order reproduces the file's
/// existing key order, which puts `spawn` before `career` — the reverse of the
/// declaration order in types.ts. Following the file keeps publish diffs clean.
/// </summary>
public sealed class SiteContent
{
    [JsonPropertyOrder(1)] public required string Brand { get; set; }

    [JsonPropertyOrder(2)] public List<NavItem> Nav { get; set; } = [];

    [JsonPropertyOrder(3)] public required Hero Hero { get; set; }

    [JsonPropertyOrder(4)] public required SectionIntro CapabilitiesIntro { get; set; }

    [JsonPropertyOrder(5)] public required SectionIntro WorkIntro { get; set; }

    /// <summary>Birth date ("YYYY-MM-DD") — drawn as a playful "spawn" point at
    /// the very start of the projects-map timeline.</summary>
    [JsonPropertyOrder(6), JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Spawn { get; set; }

    /// <summary>
    /// Employment history, chronological and possibly overlapping. The order
    /// is load-bearing: cv.nl.json's `career` overrides match by index.
    /// </summary>
    [JsonPropertyOrder(7), JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public List<CareerEntry>? Career { get; set; }

    [JsonPropertyOrder(8)] public required AboutSection About { get; set; }

    [JsonPropertyOrder(9)] public required ContactSection Contact { get; set; }
}

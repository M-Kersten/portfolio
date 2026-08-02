using System.Text.Json.Serialization;

namespace Portfolio.Cms.Core.Models;

/// <summary>
/// Three scales, large → small: city (GIS/location), room (games/apps/web),
/// chip (tools/CV/data). Mirrors the Layer union in src/content/types.ts —
/// the maquette layers, capabilities band and case categories all key off this.
/// </summary>
[JsonConverter(typeof(JsonStringEnumConverter<Layer>))]
public enum Layer
{
    [JsonStringEnumMemberName("city")] City,
    [JsonStringEnumMemberName("room")] Room,
    [JsonStringEnumMemberName("chip")] Chip,
}

/// <summary>
/// The kind of work a case represents — the facet /projects filters on. Tech
/// tags are the wrong grain to navigate by (most are used once, and Unity
/// covers nearly everything). A case may span more than one.
/// <para>
/// The names here are serialized verbatim, so they must stay identical to the
/// Discipline union in src/content/types.ts and to the DISCIPLINES set in
/// scripts/check-content.mjs. A rename here silently orphans cases.
/// </para>
/// </summary>
[JsonConverter(typeof(JsonStringEnumConverter<Discipline>))]
public enum Discipline
{
    AR,
    VR,
    AI,
    Games,
    Geo,
    Installation,
}

/// <summary>
/// The values <c>CaseStudy.kind</c> is supposed to take. Deliberately a set of
/// strings rather than an enum, because the live content does not respect it.
/// <para>
/// types.ts declares <c>kind?: 'freelance' | 'passion'</c>, but cases.json also
/// contains <c>"Freelance"</c>, <c>"Research"</c> and <c>"graduation"</c> —
/// scripts/check-content.mjs validates layer, discipline, year and follows, and
/// never looks at kind, so those slipped in. An enum here would refuse to load
/// the repo's own content, and quietly coercing the odd ones out would rewrite
/// content nobody asked us to touch.
/// </para>
/// <para>
/// So the model keeps whatever is there and ContentValidator reports anything
/// outside this set as a warning. The consequence is real but narrow, and worth
/// knowing when deciding what to do about it: CaseCard.tsx compares
/// case-sensitively against these two exact strings, so any other value makes
/// the waypoint fall back to the client name with no kind styling.
/// </para>
/// </summary>
public static class CaseKind
{
    public const string Freelance = "freelance";
    public const string Passion = "passion";

    /// <summary>The vocabulary the site actually understands.</summary>
    public static readonly IReadOnlySet<string> Known =
        new HashSet<string>(StringComparer.Ordinal) { Freelance, Passion };

    /// <summary>True when the site will render this value as a kind label.</summary>
    public static bool IsKnown(string? kind) => kind is not null && Known.Contains(kind);
}

using System.Text.Encodings.Web;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.Json.Serialization;

namespace Portfolio.Cms.Core.Json;

/// <summary>
/// Shared serializer settings for the files in src/content/.
/// <para>
/// Layout — indentation and which containers sit on one line — belongs to
/// <see cref="ContentWriter"/>, because the repo's hand-written formatting is
/// not something a serializer can express. What lives here is everything else
/// that has to match: property naming, key order, null omission and, above all,
/// escaping.
/// </para>
/// <para>
/// The escaping is the part that bites. The content files hold literal UTF-8 —
/// <c>é — ° ' &amp;</c> and friends — with not one <c>\u</c> escape between
/// them. System.Text.Json's default encoder escapes all of those for HTML
/// safety and would rewrite every file top to bottom, so we swap in the relaxed
/// encoder, which escapes only what JSON actually requires. Safe here because
/// this JSON is imported by a bundler, never interpolated into a page.
/// </para>
/// </summary>
public static class ContentJson
{
    /// <summary>Line ending the content files use. Written explicitly so a
    /// publish from a Windows machine can't smuggle in CRLFs.</summary>
    public const string Newline = "\n";

    /// <summary>
    /// Frozen and shared: JsonSerializerOptions builds a type-metadata cache on
    /// first use, so a fresh instance per call is needlessly expensive.
    /// </summary>
    public static JsonSerializerOptions Options { get; } = Build();

    private static JsonSerializerOptions Build()
    {
        var options = new JsonSerializerOptions
        {
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
            PropertyNameCaseInsensitive = false,
            // ContentWriter owns layout; this only ever renders scalars.
            WriteIndented = false,
            Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
            // Nulls are omitted per-property, never globally: CareerEntry.To is
            // a meaningful explicit null (the current role) and must survive.
            DefaultIgnoreCondition = JsonIgnoreCondition.Never,
            ReadCommentHandling = JsonCommentHandling.Disallow,
            AllowTrailingCommas = false,
        };
        // The overload matters: the no-arg MakeReadOnly() throws unless a
        // TypeInfoResolver is already set, and we want the reflection-based
        // default rather than a source-generated context.
        options.MakeReadOnly(populateMissingResolver: true);
        return options;
    }

    /// <summary>Parses content JSON. Throws <see cref="JsonException"/> on malformed
    /// input rather than returning null, so a bad file fails loudly at import.</summary>
    public static T Deserialize<T>(string json) =>
        JsonSerializer.Deserialize<T>(json, Options)
        ?? throw new JsonException($"Content parsed as null, expected {typeof(T).Name}.");

    /// <summary>Projects a model to a node tree for <see cref="ContentWriter"/>,
    /// applying key order and null omission on the way.</summary>
    public static JsonNode ToNode<T>(T value) =>
        JsonSerializer.SerializeToNode(value, Options)
        ?? throw new JsonException($"Serializing {typeof(T).Name} produced null.");
}

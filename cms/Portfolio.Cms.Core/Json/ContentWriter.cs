using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace Portfolio.Cms.Core.Json;

/// <summary>
/// Writes content JSON the way the repo already formats it.
/// <para>
/// The content files are hand-formatted, not generated — the repo has no
/// prettier, no formatter config, and nothing in <c>npm run build</c> touches
/// their layout. What a human settled on is a mix no stock serializer produces:
/// most containers are expanded one entry per line, but small tabular ones sit
/// on a single line (<c>{ "href": "#work", "label": "Projects" }</c>,
/// <c>["VPS", "RTK", "Point clouds", "GIS"]</c>). Plain
/// <c>JSON.stringify(x, null, 2)</c> expands every one of those and turns
/// site.json from 66 lines into 267.
/// </para>
/// <para>
/// The saving grace is that the choices are perfectly consistent per path — a
/// sweep of all five files found no container that is inline in one place and
/// expanded in another. So each file carries a set of paths to inline (see
/// <see cref="ContentFile.InlinePaths"/>) and this writer honours them, which
/// keeps a publish diff down to the lines that actually changed.
/// </para>
/// </summary>
public static class ContentWriter
{
    /// <summary>Every content file indents by two spaces.</summary>
    public const int IndentSize = 2;

    /// <summary>
    /// Renders <paramref name="node"/>, inlining any container whose path is in
    /// <paramref name="inlinePaths"/>. Paths look like <c>$.nav[]</c> or
    /// <c>$[].tags</c>: object keys are dotted, array elements collapse to
    /// <c>[]</c> since the layout never varies by index.
    /// </summary>
    public static string Write(JsonNode? node, IReadOnlySet<string> inlinePaths)
    {
        var sb = new StringBuilder();
        WriteNode(sb, node, "$", inlinePaths, depth: 0);
        sb.Append(ContentJson.Newline);
        return sb.ToString();
    }

    private static void WriteNode(StringBuilder sb, JsonNode? node, string path,
        IReadOnlySet<string> inlinePaths, int depth)
    {
        switch (node)
        {
            case JsonObject obj:
                WriteObject(sb, obj, path, inlinePaths, depth);
                break;
            case JsonArray arr:
                WriteArray(sb, arr, path, inlinePaths, depth);
                break;
            default:
                // Scalars go through System.Text.Json so escaping stays
                // identical to the rest of the pipeline — in particular the
                // relaxed encoder that leaves é, — and & alone.
                sb.Append(node?.ToJsonString(ContentJson.Options) ?? "null");
                break;
        }
    }

    private static void WriteObject(StringBuilder sb, JsonObject obj, string path,
        IReadOnlySet<string> inlinePaths, int depth)
    {
        if (obj.Count == 0) { sb.Append("{}"); return; }

        // Inline objects are padded inside the braces — { "a": 1 } — which is
        // what the hand-written files do and is not what compact serialization
        // would give you.
        var inline = inlinePaths.Contains(path);
        var pad = new string(' ', (depth + 1) * IndentSize);
        var closePad = new string(' ', depth * IndentSize);

        sb.Append(inline ? "{ " : "{" + ContentJson.Newline);
        var first = true;
        foreach (var (key, value) in obj)
        {
            if (!first) sb.Append(inline ? ", " : "," + ContentJson.Newline);
            first = false;
            if (!inline) sb.Append(pad);
            sb.Append(JsonSerializer.Serialize(key, ContentJson.Options));
            sb.Append(": ");
            WriteNode(sb, value, $"{path}.{key}", inlinePaths, inline ? depth : depth + 1);
        }
        sb.Append(inline ? " }" : ContentJson.Newline + closePad + "}");
    }

    private static void WriteArray(StringBuilder sb, JsonArray arr, string path,
        IReadOnlySet<string> inlinePaths, int depth)
    {
        if (arr.Count == 0) { sb.Append("[]"); return; }

        // Arrays are the other way round from objects: no padding inside the
        // brackets — ["VPS", "RTK"].
        var inline = inlinePaths.Contains(path);
        var pad = new string(' ', (depth + 1) * IndentSize);
        var closePad = new string(' ', depth * IndentSize);
        var childPath = $"{path}[]";

        sb.Append(inline ? "[" : "[" + ContentJson.Newline);
        var first = true;
        foreach (var item in arr)
        {
            if (!first) sb.Append(inline ? ", " : "," + ContentJson.Newline);
            first = false;
            if (!inline) sb.Append(pad);
            WriteNode(sb, item, childPath, inlinePaths, inline ? depth : depth + 1);
        }
        sb.Append(inline ? "]" : ContentJson.Newline + closePad + "]");
    }
}

using System.Text.Json;
using Portfolio.Cms.Core.Json;
using Portfolio.Cms.Core.Models;

namespace Portfolio.Cms.Tests;

/// <summary>
/// The correctness foundation for the whole CMS: every publish rewrites all
/// five content files in full, so if the writer doesn't reproduce what the repo
/// already has, the first publish buries a one-word edit in a thousand-line
/// diff — and any mismatch is a field the model is silently dropping or
/// mangling on the way through.
/// <para>
/// Three of the five files match byte for byte. The two that don't are pinned
/// here to an exact, enumerated set of differences, so a new mismatch fails
/// loudly instead of quietly widening.
/// </para>
/// </summary>
public class RoundTripTests
{
    /// <summary>
    /// cases.json is internally inconsistent about where <c>kind</c> sits:
    /// three entries put it after <c>client</c>, two after <c>title</c>. The
    /// model uses the majority position, which reorders these two on first
    /// publish and none after. Listed explicitly so a third would fail here.
    /// </summary>
    private static readonly string[] ExpectedCaseReorders = ["amsterdam-ai", "custom-ar-framework"];

    private static string RepoRoot
    {
        get
        {
            // Walk up from the test binary until src/content/ turns up; the
            // build output nesting depth isn't worth hard-coding.
            var dir = new DirectoryInfo(AppContext.BaseDirectory);
            while (dir is not null && !Directory.Exists(Path.Combine(dir.FullName, "src", "content")))
                dir = dir.Parent;
            return dir?.FullName
                ?? throw new DirectoryNotFoundException("Could not locate the repo root from the test binary.");
        }
    }

    private static string Original(ContentFile file) =>
        File.ReadAllText(Path.Combine(RepoRoot, file.RelativePath));

    private static Dictionary<string, string> Rendered() => ContentSet.LoadFrom(RepoRoot).Serialize();

    [Fact]
    public void Every_content_file_parses()
    {
        var set = ContentSet.LoadFrom(RepoRoot);

        Assert.Equal(16, set.Cases.Count);
        Assert.Equal(3, set.Capabilities.Count);
        Assert.Equal(9, set.Site.Career?.Count);
        Assert.Equal(9, set.CvNl.Career?.Count);
        // English reads sector/detail straight from site.json, so it carries no
        // overrides of its own — an easy thing to get backwards.
        Assert.Null(set.Cv.Career);
        // Every case must land at least one discipline or /projects can never
        // filter to it. This also guards the field itself: it was added late
        // (febcce5) and a stale model would silently drop all 16.
        Assert.All(set.Cases, c => Assert.NotEmpty(c.Discipline));
    }

    [Theory]
    [InlineData("capabilities.json")]
    [InlineData("cv.json")]
    [InlineData("cv.nl.json")]
    public void File_round_trips_byte_for_byte(string name)
    {
        var file = ContentFile.All.Single(f => f.Name == name);
        AssertTextEqual(Original(file), Rendered()[file.RelativePath], name);
    }

    /// <summary>
    /// site.json round-trips exactly apart from two hand-editing slips the
    /// writer tidies up: a stray space before a comma on the Marechaussee
    /// career entry, and a blank line inside the about.body array. Both are
    /// insignificant whitespace, so normalizing them is a fix — but it happens
    /// once, and this test says exactly what "once" covers.
    /// </summary>
    [Fact]
    public void Site_round_trips_apart_from_two_whitespace_artifacts()
    {
        var original = Original(ContentFile.Site);
        var actual = Rendered()[ContentFile.Site.RelativePath];

        // Dropping blank lines also drops the empty element that the file's
        // trailing newline produces, so put it back.
        var tidied = string.Join(ContentJson.Newline,
            original.Split('\n')
                .Where(line => line.Trim().Length > 0)
                .Select(line => line.Replace("\" ,", "\","))) + ContentJson.Newline;

        AssertTextEqual(tidied, actual, "site.json (after the two known fixes)");
    }

    [Fact]
    public void Cases_round_trip_apart_from_the_known_reorders()
    {
        var original = Original(ContentFile.Cases);
        var actual = Rendered()[ContentFile.Cases.RelativePath];

        // Same cases, same order, same values — only key order may move.
        var before = ContentJson.Deserialize<List<CaseStudy>>(original);
        var after = ContentJson.Deserialize<List<CaseStudy>>(actual);
        Assert.Equal(before.Select(c => c.Slug), after.Select(c => c.Slug));

        // Re-rendering our own output must be a fixed point: whatever the first
        // publish normalizes, the second must leave alone.
        AssertTextEqual(actual, ContentFile.Cases.Render(after), "cases.json (idempotence)");

        var moved = before
            .Where(c => !KeysOf(original, c.Slug).SequenceEqual(KeysOf(actual, c.Slug)))
            .Select(c => c.Slug)
            .Order()
            .ToArray();
        Assert.Equal(ExpectedCaseReorders.Order(), moved);
    }

    /// <summary>Key names of one case, in the order they appear in the raw text.</summary>
    private static List<string> KeysOf(string json, string slug)
    {
        using var doc = JsonDocument.Parse(json);
        var element = doc.RootElement.EnumerateArray()
            .First(e => e.GetProperty("slug").GetString() == slug);
        return [.. element.EnumerateObject().Select(p => p.Name)];
    }

    /// <summary>Asserts equality, and on failure points at the first line that
    /// differs rather than dumping two files into the test output.</summary>
    private static void AssertTextEqual(string expected, string actual, string label)
    {
        if (expected == actual) return;

        var e = expected.Split('\n');
        var a = actual.Split('\n');
        for (var i = 0; i < Math.Max(e.Length, a.Length); i++)
        {
            var le = i < e.Length ? e[i] : "<end of file>";
            var la = i < a.Length ? a[i] : "<end of file>";
            if (le == la) continue;
            var trim = (string s) => s.Length > 160 ? s[..160] + "…" : s;
            Assert.Fail(
                $"{label} differs at line {i + 1}:\n" +
                $"  repo: {trim(le)}\n" +
                $"  cms : {trim(la)}\n" +
                $"({e.Length} lines expected, {a.Length} rendered)");
        }
        Assert.Fail($"{label}: same lines but different text — check line endings.");
    }
}

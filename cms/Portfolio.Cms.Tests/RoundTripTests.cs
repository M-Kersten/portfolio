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
/// Four of the five files match byte for byte. The one that doesn't —
/// site.json — is pinned here to an exact, enumerated set of differences, so a
/// new mismatch fails loudly instead of quietly widening.
/// </para>
/// </summary>
public class RoundTripTests
{
    /// <summary>
    /// Cases whose key order the model moves on the way through.
    /// <para>
    /// Empty, and that is the finished state rather than a gap. cases.json used
    /// to be inconsistent about where <c>kind</c> sat — three entries after
    /// <c>client</c>, two after <c>title</c> — and this pinned the two the
    /// model's majority order would move. Those have since been normalized in
    /// the repo, so nothing moves any more. Kept as an empty list rather than
    /// deleted, because the assertion below is what would catch a future edit
    /// (or a hand-written entry) drifting out of the model's key order.
    /// </para>
    /// </summary>
    private static readonly string[] ExpectedCaseReorders = [];

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
        Assert.Equal(10, set.Site.Career?.Count);
        Assert.Equal(10, set.CvNl.Career?.Count);
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

    /// <summary>
    /// A gallery has to survive the model exactly, and no case in the repo has
    /// one yet — so this pins the shape directly rather than waiting for real
    /// content to catch a regression.
    /// <para>
    /// Three things are asserted at once and each has bitten this pipeline
    /// before: <c>gallery</c> lands last (so adding the field to sixteen
    /// existing cases is a pure addition, not a reshuffle), an absent caption
    /// stays absent rather than serializing as <c>null</c> or <c>""</c> — the
    /// site reads "no caption" as "decorative, use alt=''" — and the frames
    /// expand one key per line, which is what cases.json does everywhere else.
    /// </para>
    /// </summary>
    [Fact]
    public void A_gallery_renders_in_the_repo_s_own_shape()
    {
        var one = new CaseStudy
        {
            Slug = "picture-led", Title = "Picture led", Layer = Layer.Room, Client = "Someone",
            Sector = "Test", Discipline = [Discipline.Installation],
            Problem = "p", Approach = "a", Outcome = "o", Year = "2026", Archive = true,
            Gallery =
            [
                new GalleryImage { File = "01.jpg", Caption = "The cabinet, closed." },
                new GalleryImage { File = "02.jpg" },
            ],
        };

        var rendered = ContentFile.Cases.Render(new List<CaseStudy> { one });

        AssertTextEqual(
            """
            [
              {
                "slug": "picture-led",
                "title": "Picture led",
                "layer": "room",
                "client": "Someone",
                "sector": "Test",
                "discipline": [
                  "Installation"
                ],
                "problem": "p",
                "approach": "a",
                "outcome": "o",
                "year": "2026",
                "archive": true,
                "gallery": [
                  {
                    "file": "01.jpg",
                    "caption": "The cabinet, closed."
                  },
                  {
                    "file": "02.jpg"
                  }
                ]
              }
            ]

            """.ReplaceLineEndings(ContentJson.Newline),
            rendered,
            "a case with a gallery");

        // …and it comes back the way it went in.
        var parsed = ContentJson.Deserialize<List<CaseStudy>>(rendered)[0];
        var gallery = Assert.IsType<List<GalleryImage>>(parsed.Gallery);
        Assert.Equal(["01.jpg", "02.jpg"], gallery.Select(g => g.File));
        Assert.Equal("The cabinet, closed.", gallery[0].Caption);
        Assert.Null(gallery[1].Caption);
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

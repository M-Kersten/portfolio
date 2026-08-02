using Portfolio.Cms.Core.Models;

namespace Portfolio.Cms.Core.Json;

/// <summary>
/// The five files the CMS owns. Nothing else in src/content/ is editable
/// content — index.ts and types.ts are code, and stay hand-maintained.
/// </summary>
/// <param name="RelativePath">Path from the repo root, forward slashes — this
/// is also the path used in the GitHub commit, so it must not be
/// platform-joined.</param>
/// <param name="InlinePaths">Containers this file keeps on a single line, as
/// <see cref="ContentWriter"/> paths. Derived by sweeping the existing files:
/// every container was consistently inline or consistently expanded, never
/// both, so these reproduce the hand-formatting exactly.</param>
public sealed record ContentFile(string RelativePath, IReadOnlySet<string> InlinePaths)
{
    private static IReadOnlySet<string> Paths(params string[] paths) =>
        new HashSet<string>(paths, StringComparer.Ordinal);

    /// <summary>Everything expanded — the long prose fields make one-lining pointless.</summary>
    public static readonly ContentFile Cases = new("src/content/cases.json", Paths());

    public static readonly ContentFile Capabilities = new("src/content/capabilities.json",
        Paths("$[].tags"));

    public static readonly ContentFile Site = new("src/content/site.json",
        Paths("$.nav[]", "$.about.facts[]", "$.contact.links[]", "$.career[]", "$.career[].tech"));

    public static readonly ContentFile Cv = new("src/content/cv.json",
        Paths("$.links[]", "$.certificates", "$.languages"));

    /// <summary>Same layout as cv.json, but note <c>$.career[]</c> is expanded
    /// here while site.json's career entries are inline — different files, and
    /// each is internally consistent.</summary>
    public static readonly ContentFile CvNl = new("src/content/cv.nl.json",
        Paths("$.links[]", "$.certificates", "$.languages"));

    public static readonly IReadOnlyList<ContentFile> All =
        [Cases, Capabilities, Site, Cv, CvNl];

    /// <summary>Reads the raw file texts from a checkout, keyed by repo-relative path.</summary>
    public static Dictionary<string, string> ReadFrom(string repoRoot) =>
        All.ToDictionary(f => f.RelativePath, f => File.ReadAllText(Path.Combine(repoRoot, f.RelativePath)));

    /// <summary>Just the file name, for log lines and error messages.</summary>
    public string Name => RelativePath[(RelativePath.LastIndexOf('/') + 1)..];

    /// <summary>Renders a value with this file's layout.</summary>
    public string Render<T>(T value) => ContentWriter.Write(ContentJson.ToNode(value), InlinePaths);
}

/// <summary>
/// Everything the CMS edits, in one object. Loading and publishing both work on
/// the whole set rather than a file at a time, because the cross-file rules
/// need it: cv.nl.json's career overrides are validated against site.json's
/// career list, and <c>follows</c> is checked across all cases at once.
/// </summary>
public sealed class ContentSet
{
    public required List<CaseStudy> Cases { get; set; }
    public required List<Capability> Capabilities { get; set; }
    public required SiteContent Site { get; set; }
    public required CvContent Cv { get; set; }
    public required CvContent CvNl { get; set; }

    /// <summary>Renders every file to its final text, keyed by repo-relative path.</summary>
    public Dictionary<string, string> Serialize() => new()
    {
        [ContentFile.Cases.RelativePath] = ContentFile.Cases.Render(Cases),
        [ContentFile.Capabilities.RelativePath] = ContentFile.Capabilities.Render(Capabilities),
        [ContentFile.Site.RelativePath] = ContentFile.Site.Render(Site),
        [ContentFile.Cv.RelativePath] = ContentFile.Cv.Render(Cv),
        [ContentFile.CvNl.RelativePath] = ContentFile.CvNl.Render(CvNl),
    };

    /// <summary>
    /// Parses a content set from the raw file texts, keyed by repo-relative
    /// path. Kept separate from reading them because the CMS gets these two
    /// ways: from a checkout when running locally, and over the GitHub API when
    /// running on App Service, where there is no checkout at all.
    /// </summary>
    public static ContentSet FromTexts(IReadOnlyDictionary<string, string> files)
    {
        string Read(ContentFile f) => files.TryGetValue(f.RelativePath, out var text)
            ? text
            : throw new KeyNotFoundException($"No content supplied for {f.RelativePath}.");

        return new ContentSet
        {
            Cases = ContentJson.Deserialize<List<CaseStudy>>(Read(ContentFile.Cases)),
            Capabilities = ContentJson.Deserialize<List<Capability>>(Read(ContentFile.Capabilities)),
            Site = ContentJson.Deserialize<SiteContent>(Read(ContentFile.Site)),
            Cv = ContentJson.Deserialize<CvContent>(Read(ContentFile.Cv)),
            CvNl = ContentJson.Deserialize<CvContent>(Read(ContentFile.CvNl)),
        };
    }

    /// <summary>Reads a content set from a checkout (or any directory laid out like one).</summary>
    public static ContentSet LoadFrom(string repoRoot) => FromTexts(ContentFile.ReadFrom(repoRoot));
}

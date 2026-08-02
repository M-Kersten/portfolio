using System.Text.RegularExpressions;

namespace Portfolio.Cms.Core.Validation;

/// <summary>
/// The parts of the repository the CMS does not own but must not break.
/// <para>
/// Cases are wired into the 3D maquette by typed-out slug from two TypeScript
/// files the CMS can't edit, and each curated case needs a poster on disk.
/// Validation needs all of that, but the CMS runs on App Service with no
/// checkout — so this is gathered separately (from a clone, or over the GitHub
/// API at publish time) and passed in.
/// </para>
/// </summary>
/// <param name="HotspotSlugs">Slugs named by src/scene/framing.ts. Each one is
/// a hand-placed 3D hotspot with its own camera framing; if a case with a
/// hotspot is deleted the site build fails, so this is what makes deletion
/// safe.</param>
/// <param name="RelationSlugs">Slugs named by src/scene/maquette/signals.tsx —
/// the endpoints of the cross-layer relation cables.</param>
/// <param name="PosterSlugs">Slugs with artwork at public/posters/{slug}.jpg.</param>
/// <param name="PublicFiles">Paths present under public/, as they appear in
/// content (leading slash, e.g. <c>/logos/kmar.png</c>).</param>
public sealed record RepoFacts(
    IReadOnlySet<string> HotspotSlugs,
    IReadOnlySet<string> RelationSlugs,
    IReadOnlySet<string> PosterSlugs,
    IReadOnlySet<string> PublicFiles)
{
    /// <summary>Same pattern scripts/check-content.mjs uses to pull hotspot slugs.</summary>
    private static readonly Regex HotspotPattern = new(@"\{\s*slug:\s*'([^']+)'", RegexOptions.Compiled);

    /// <summary>Same pattern check-content.mjs uses for relation endpoints.</summary>
    private static readonly Regex RelationPattern = new(@"(?:from|to):\s*'([^']+)'", RegexOptions.Compiled);

    private static HashSet<string> Match(Regex pattern, string source) =>
        [.. pattern.Matches(source).Select(m => m.Groups[1].Value)];

    /// <summary>Extracts the scene references from the two TypeScript sources.</summary>
    public static (IReadOnlySet<string> Hotspots, IReadOnlySet<string> Relations) ParseScene(
        string framingTs, string signalsTsx) =>
        (Match(HotspotPattern, framingTs), Match(RelationPattern, signalsTsx));

    /// <summary>Gathers everything from a checkout.</summary>
    public static RepoFacts FromCheckout(string repoRoot)
    {
        var (hotspots, relations) = ParseScene(
            File.ReadAllText(Path.Combine(repoRoot, "src/scene/framing.ts")),
            File.ReadAllText(Path.Combine(repoRoot, "src/scene/maquette/signals.tsx")));

        var postersDir = Path.Combine(repoRoot, "public", "posters");
        var posters = Directory.Exists(postersDir)
            ? Directory.EnumerateFiles(postersDir, "*.jpg").Select(Path.GetFileNameWithoutExtension)
            : [];

        var publicDir = Path.Combine(repoRoot, "public");
        var publicFiles = Directory.Exists(publicDir)
            ? Directory.EnumerateFiles(publicDir, "*", SearchOption.AllDirectories)
                .Select(p => "/" + Path.GetRelativePath(publicDir, p).Replace(Path.DirectorySeparatorChar, '/'))
            : [];

        return new RepoFacts(
            hotspots,
            relations,
            new HashSet<string>(posters!, StringComparer.Ordinal),
            new HashSet<string>(publicFiles, StringComparer.Ordinal));
    }
}

using System.Text.RegularExpressions;
using Portfolio.Cms.Core.Json;
using Portfolio.Cms.Core.Models;

namespace Portfolio.Cms.Core.Validation;

/// <summary>
/// The server-side port of scripts/check-content.mjs, plus the few rules that
/// script doesn't have.
/// <para>
/// Without this the CMS is a machine for breaking the deploy. The site is
/// edited by hand today, and several things point at each other by typed-out
/// slug — the 3D hotspots, the relation cables, the poster files, the `follows`
/// storyline links, the Dutch CV's career overrides. A bad value fails silently
/// in the browser, so check-content.mjs fails the build instead. A publish that
/// skipped these checks would simply move the breakage from "someone typing
/// JSON" to "someone clicking Save", which is worse: the build fails after the
/// commit is already pushed.
/// </para>
/// <para>
/// The error/warning split is deliberately identical to the script's, so what
/// blocks a publish is exactly what would block a build.
/// </para>
/// </summary>
public static class ContentValidator
{
    /// <summary>"YYYY" or "YYYY-MM" — a case may be dated to the year only.</summary>
    private static readonly Regex CaseYear = new(@"^\d{4}(-(0[1-9]|1[0-2]))?$", RegexOptions.Compiled);

    /// <summary>"YYYY-MM" — career stints always carry a month.</summary>
    private static readonly Regex YearMonth = new(@"^\d{4}-(0[1-9]|1[0-2])$", RegexOptions.Compiled);

    private static readonly Regex HttpUrl = new(@"^https?://", RegexOptions.Compiled);
    private static readonly Regex HttpOrMailto = new(@"^(https?://|mailto:)", RegexOptions.Compiled);
    private static readonly Regex YouTube = new(@"^https://(www\.)?(youtube\.com|youtu\.be)/", RegexOptions.Compiled);

    public static ValidationResult Validate(ContentSet content, RepoFacts repo)
    {
        var result = new ValidationResult();
        var slugs = ValidateCases(content, repo, result);
        ValidateScene(repo, slugs, result);
        ValidateSite(content, repo, result);
        ValidateCapabilities(content, result);
        ValidateCvPacks(content, repo, result);
        return result;
    }

    /// <returns>Every slug in the set — the scene and `follows` checks need the
    /// complete list, so forward references resolve.</returns>
    private static HashSet<string> ValidateCases(ContentSet content, RepoFacts repo, ValidationResult result)
    {
        var slugs = new HashSet<string>(StringComparer.Ordinal);

        for (var i = 0; i < content.Cases.Count; i++)
        {
            var c = content.Cases[i];
            var who = $"cases.json → \"{Describe(c)}\"";
            var path = $"cases[{i}]";
            var archive = c.Archive == true;

            if (string.IsNullOrWhiteSpace(c.Slug)) result.Error(who, "missing \"slug\"", $"{path}.slug");
            else if (!slugs.Add(c.Slug)) result.Error(who, "duplicate slug", $"{path}.slug");

            // layer and discipline values can't be wrong by this point — they
            // are enums, so a bad one fails at parse rather than here. What can
            // still be wrong is an empty discipline list, which would leave the
            // case unreachable by every filter on /projects.
            if (c.Discipline.Count == 0)
                result.Error(who,
                    "needs at least one discipline, or /projects can never filter to it",
                    $"{path}.discipline");

            foreach (var (field, value) in new[]
                     {
                         ("title", c.Title), ("problem", c.Problem),
                         ("approach", c.Approach), ("outcome", c.Outcome),
                     })
                if (string.IsNullOrWhiteSpace(value))
                    result.Error(who, $"missing \"{field}\"", $"{path}.{field}");

            // An archive case reaches neither the wall tile nor the timeline, so
            // it may go undated. Anything else needs a parseable year.
            if (!(c.Year is null && archive) && !CaseYear.IsMatch(c.Year ?? ""))
                result.Error(who, $"year must be \"YYYY\" or \"YYYY-MM\" (got \"{c.Year}\")", $"{path}.year");

            if (!string.IsNullOrEmpty(c.Slug) && !repo.PosterSlugs.Contains(c.Slug))
                result.Add(!archive, who,
                    $"no poster at public/posters/{c.Slug}.jpg"
                    + (archive ? " — the index will render a styled empty node" : ""),
                    $"{path}.poster");

            if (!string.IsNullOrEmpty(c.Video) && !YouTube.IsMatch(c.Video))
                result.Warn(who, "video isn't a YouTube URL — the embed only understands YouTube", $"{path}.video");

            // Not in check-content.mjs, which never looks at `kind` — which is
            // how "Freelance", "Research" and "graduation" got in. CaseCard.tsx
            // compares case-sensitively against the two known values, so
            // anything else silently loses its badge and its colour.
            if (c.Kind is not null && !CaseKind.IsKnown(c.Kind))
                result.Warn(who,
                    $"kind \"{c.Kind}\" isn't one of {string.Join(" | ", CaseKind.Known)} — the waypoint "
                    + "will fall back to the client name with no kind styling",
                    $"{path}.kind");
        }

        // Checked after the slug set is complete so forward references work.
        for (var i = 0; i < content.Cases.Count; i++)
        {
            var c = content.Cases[i];
            if (c.Follows is not null && !slugs.Contains(c.Follows))
                result.Error($"cases.json → \"{Describe(c)}\"",
                    $"follows \"{c.Follows}\", which isn't a case slug", $"cases[{i}].follows");
        }

        return slugs;
    }

    /// <summary>
    /// The deletion guard. The 3D scene names cases by slug from TypeScript the
    /// CMS can't edit, so removing or renaming a case that has a hotspot or a
    /// relation cable orphans that reference and fails the build. Reported
    /// against the scene file because that's where the fix has to happen — by
    /// hand, in 3D.
    /// </summary>
    private static void ValidateScene(RepoFacts repo, HashSet<string> slugs, ValidationResult result)
    {
        foreach (var slug in repo.HotspotSlugs.Where(s => !slugs.Contains(s)).Order())
            result.Error("framing.ts", $"hotspot slug \"{slug}\" has no case in cases.json — "
                + "restore the case, or remove its hotspot and camera framing from src/scene/framing.ts");

        foreach (var slug in repo.RelationSlugs.Where(s => !slugs.Contains(s)).Order())
            result.Error("signals.tsx", $"relation endpoint \"{slug}\" has no case in cases.json — "
                + "restore the case, or remove the cable from src/scene/maquette/signals.tsx");
    }

    private static void ValidateSite(ContentSet content, RepoFacts repo, ValidationResult result)
    {
        var career = content.Site.Career ?? [];
        for (var i = 0; i < career.Count; i++)
        {
            var j = career[i];
            var who = $"site.json → career \"{j.Company}\"";
            var path = $"site.career[{i}]";

            if (!YearMonth.IsMatch(j.From ?? ""))
                result.Error(who, $"\"from\" must be YYYY-MM (got \"{j.From}\")", $"{path}.from");

            // null is legal and meaningful here — it marks the current role.
            if (j.To is not null && !YearMonth.IsMatch(j.To))
                result.Error(who, $"\"to\" must be YYYY-MM or empty for the current role (got \"{j.To}\")", $"{path}.to");

            if (!string.IsNullOrEmpty(j.Url) && !HttpUrl.IsMatch(j.Url))
                result.Error(who, "url should start with https://", $"{path}.url");

            if (string.IsNullOrEmpty(j.Logo))
                result.Warn(who, "no logo — the CV entry will have no mark", $"{path}.logo");
            else if (!repo.PublicFiles.Contains(j.Logo))
                result.Warn(who, $"logo {j.Logo} not found — the tooltip falls back to the site favicon", $"{path}.logo");
        }

        var links = content.Site.Contact.Links;
        for (var i = 0; i < links.Count; i++)
            if (!HttpUrl.IsMatch(links[i].Href))
                result.Error($"site.json → contact link \"{links[i].Label}\"",
                    "href should be a full URL", $"site.contact.links[{i}].href");
    }

    private static void ValidateCapabilities(ContentSet content, ValidationResult result)
    {
        // The band is a three-column layout, one per layer; a fourth or a
        // missing one leaves a gap rather than reflowing.
        if (content.Capabilities.Count != 3)
            result.Error("capabilities.json",
                $"expected exactly 3 entries (the three band columns), got {content.Capabilities.Count}",
                "capabilities");
    }

    private static void ValidateCvPacks(ContentSet content, RepoFacts repo, ValidationResult result)
    {
        var careerCount = content.Site.Career?.Count ?? 0;

        foreach (var (name, pack, isTranslation) in new[]
                 {
                     ("cv.json", content.Cv, false),
                     ("cv.nl.json", content.CvNl, true),
                 })
        {
            var root = isTranslation ? "cvNl" : "cv";

            foreach (var (field, empty) in new[]
                     {
                         ("tagline", string.IsNullOrWhiteSpace(pack.Tagline)),
                         ("profile", string.IsNullOrWhiteSpace(pack.Profile)),
                         ("location", string.IsNullOrWhiteSpace(pack.Location)),
                         ("offTheClock", string.IsNullOrWhiteSpace(pack.OffTheClock)),
                         ("links", pack.Links.Count == 0),
                         ("stack", pack.Stack.Count == 0),
                         ("education", pack.Education.Count == 0),
                         ("languages", pack.Languages.Count == 0),
                     })
                if (empty) result.Error(name, $"missing \"{field}\"", $"{root}.{field}");

            foreach (var (field, value) in new[]
                     {
                         ("profile", pack.Ui.Profile), ("experience", pack.Ui.Experience),
                         ("education", pack.Ui.Education), ("stack", pack.Ui.Stack),
                         ("languages", pack.Ui.Languages), ("now", pack.Ui.Now),
                         ("back", pack.Ui.Back), ("download", pack.Ui.Download),
                     })
                if (string.IsNullOrWhiteSpace(value))
                    result.Error($"{name} → ui", $"missing \"{field}\"", $"{root}.ui.{field}");

            for (var i = 0; i < pack.Education.Count; i++)
                if (string.IsNullOrWhiteSpace(pack.Education[i].School)
                    || string.IsNullOrWhiteSpace(pack.Education[i].Degree))
                    result.Error(name, "every education entry needs \"school\" and \"degree\"",
                        $"{root}.education[{i}]");

            for (var i = 0; i < pack.Links.Count; i++)
            {
                var link = pack.Links[i];
                if (!string.IsNullOrEmpty(link.Href) && !HttpOrMailto.IsMatch(link.Href))
                    result.Error($"{name} → link \"{link.Label}\"",
                        "href should be a full URL or mailto:", $"{root}.links[{i}].href");
            }

            // A translation overrides site.json's career entries positionally,
            // so the two lists must stay the same length and order. This is the
            // rule most likely to be tripped by ordinary editing: adding a job
            // in site.json without adding its Dutch text breaks the build.
            if (isTranslation)
            {
                var overrides = pack.Career ?? [];
                if (overrides.Count != careerCount)
                    result.Error(name,
                        $"career has {overrides.Count} entries but site.json has {careerCount} — "
                        + "they are matched by position, so add or remove the matching entry",
                        $"{root}.career");

                for (var i = 0; i < overrides.Count; i++)
                    if (string.IsNullOrWhiteSpace(overrides[i].Detail))
                        result.Error(name, $"career[{i}]: missing \"detail\"", $"{root}.career[{i}].detail");
            }
        }

        if (!string.IsNullOrEmpty(content.Cv.Photo) && !repo.PublicFiles.Contains(content.Cv.Photo))
            result.Error("cv.json", $"photo {content.Cv.Photo} not found in public/", "cv.photo");

        foreach (var pdf in new[] { "/cv.pdf", "/cv-nl.pdf" })
            if (!repo.PublicFiles.Contains(pdf))
                result.Warn($"public{pdf}", "missing — run `npm run cv` to regenerate the downloadable CVs");
    }

    private static string Describe(CaseStudy c) =>
        !string.IsNullOrWhiteSpace(c.Slug) ? c.Slug
        : !string.IsNullOrWhiteSpace(c.Title) ? c.Title
        : "??";
}

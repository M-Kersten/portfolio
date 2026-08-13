using Portfolio.Cms.Core.Json;
using Portfolio.Cms.Core.Models;
using Portfolio.Cms.Core.Validation;

namespace Portfolio.Cms.Tests;

/// <summary>
/// The CMS is only safe to publish from if it refuses exactly what the site
/// build refuses. These cover the agreement with scripts/check-content.mjs on
/// the real content, and then each way ordinary editing can break the build.
/// </summary>
public class ValidationTests
{
    private static string RepoRoot
    {
        get
        {
            var dir = new DirectoryInfo(AppContext.BaseDirectory);
            while (dir is not null && !Directory.Exists(Path.Combine(dir.FullName, "src", "content")))
                dir = dir.Parent;
            return dir?.FullName
                ?? throw new DirectoryNotFoundException("Could not locate the repo root from the test binary.");
        }
    }

    private static (ContentSet Content, RepoFacts Repo) Load() =>
        (ContentSet.LoadFrom(RepoRoot), RepoFacts.FromCheckout(RepoRoot));

    private static ValidationResult Validate(Action<ContentSet>? mutate = null)
    {
        var (content, repo) = Load();
        mutate?.Invoke(content);
        return ContentValidator.Validate(content, repo);
    }

    [Fact]
    public void Current_content_publishes_cleanly()
    {
        var result = Validate();

        Assert.True(result.CanPublish,
            "unedited repo content must validate, or the CMS would refuse to publish what is already live:\n  "
            + string.Join("\n  ", result.Errors));
    }

    /// <summary>
    /// The three off-vocabulary `kind` values are reported, but as warnings —
    /// they are pre-existing content the CMS must still be able to publish.
    /// </summary>
    [Fact]
    public void Unknown_kind_values_warn_without_blocking()
    {
        var result = Validate();

        var flagged = result.Warnings
            .Where(w => w.Field?.EndsWith(".kind") == true)
            .Select(w => w.Where)
            .Order()
            .ToArray();

        Assert.Equal(
            ["cases.json → \"amsterdam-ai\"", "cases.json → \"custom-ar-framework\"", "cases.json → \"zwijsen-ar-books\""],
            flagged);
        Assert.True(result.CanPublish);
    }

    /// <summary>
    /// The one that matters most. Cases are wired into the maquette by slug
    /// from TypeScript the CMS can't see, so deleting the wrong case breaks the
    /// build — after the commit has already been pushed.
    /// </summary>
    [Fact]
    public void Deleting_a_case_that_has_a_3d_hotspot_is_an_error()
    {
        var (_, repo) = Load();
        var wired = repo.HotspotSlugs.First();

        var result = Validate(c => c.Cases.RemoveAll(x => x.Slug == wired));

        Assert.False(result.CanPublish);
        Assert.Contains(result.Errors, e => e.Where == "framing.ts" && e.Problem.Contains(wired));
    }

    [Fact]
    public void Deleting_a_case_another_case_follows_is_an_error()
    {
        var (content, _) = Load();
        var target = content.Cases.First(c => c.Follows is not null).Follows!;

        var result = Validate(c => c.Cases.RemoveAll(x => x.Slug == target));

        Assert.False(result.CanPublish);
        Assert.Contains(result.Errors, e => e.Problem.Contains($"follows \"{target}\""));
    }

    /// <summary>
    /// cv.nl.json's career overrides are matched to site.json's career list by
    /// position, so adding a job in one file and not the other breaks the build.
    /// </summary>
    [Fact]
    public void Adding_a_career_entry_without_its_dutch_translation_is_an_error()
    {
        var result = Validate(c => c.Site.Career!.Add(new CareerEntry
        {
            Company = "New Job",
            From = "2026-08",
            To = null,
            Color = "#ffffff",
        }));

        Assert.False(result.CanPublish);
        Assert.Contains(result.Errors, e => e.Field == "cvNl.career" && e.Problem.Contains("matched by position"));
    }

    [Fact]
    public void A_new_case_without_a_poster_is_an_error_unless_it_is_archived()
    {
        CaseStudy NewCase(bool archive) => new()
        {
            Slug = "brand-new-case",
            Title = "Brand new case",
            Layer = Layer.Room,
            Client = "Someone",
            Sector = "Test",
            Discipline = [Discipline.AR],
            Problem = "p",
            Approach = "a",
            Outcome = "o",
            Year = "2026",
            Archive = archive ? true : null,
        };

        var curated = Validate(c => c.Cases.Add(NewCase(archive: false)));
        Assert.False(curated.CanPublish);
        Assert.Contains(curated.Errors, e => e.Problem.Contains("public/posters/brand-new-case.jpg"));

        // An archive case only ever appears as a node in the index, which
        // already degrades a missing poster gracefully.
        var archived = Validate(c => c.Cases.Add(NewCase(archive: true)));
        Assert.True(archived.CanPublish);
        Assert.Contains(archived.Warnings, w => w.Problem.Contains("public/posters/brand-new-case.jpg"));
    }

    [Fact]
    public void A_case_with_no_discipline_is_an_error()
    {
        var result = Validate(c => c.Cases[0].Discipline.Clear());

        Assert.False(result.CanPublish);
        Assert.Contains(result.Errors, e => e.Problem.Contains("at least one discipline"));
    }

    [Fact]
    public void Duplicate_slugs_are_an_error()
    {
        var result = Validate(c => c.Cases.Add(c.Cases[0]));

        Assert.False(result.CanPublish);
        Assert.Contains(result.Errors, e => e.Problem == "duplicate slug");
    }

    /* ---------- galleries ----------
       These pretend files exist rather than writing any, because what the
       validator actually consults is RepoFacts.PublicFiles — a snapshot that is
       gathered from a checkout locally but over the GitHub API when the CMS
       runs on App Service with no working tree. Testing through the snapshot is
       testing the path that runs in production. */

    /// <summary>Puts a case's gallery frames into the repo snapshot, as if they
    /// had been committed under public/gallery/{slug}/.</summary>
    private static ValidationResult ValidateWithFiles(string slug, string[] onDisk, Action<ContentSet> mutate)
    {
        var (content, repo) = Load();
        mutate(content);
        return ContentValidator.Validate(
            content,
            repo with
            {
                PublicFiles = new HashSet<string>(
                    repo.PublicFiles.Concat(onDisk.Select(f => $"/gallery/{slug}/{f}")),
                    StringComparer.Ordinal),
            });
    }

    private static CaseStudy WithGallery(ContentSet content, params GalleryImage[] images)
    {
        var c = content.Cases[0];
        c.Gallery = [.. images];
        return c;
    }

    private static CaseStudy WithLinks(ContentSet content, params CaseLink[] links)
    {
        var c = content.Cases[0];
        c.Links = [.. links];
        return c;
    }

    /// <summary>
    /// Both halves of a link are load-bearing and neither degrades into
    /// something a visitor can recover from: a blank label is a button with no
    /// words on it, a bad URL is one that goes nowhere.
    /// </summary>
    [Fact]
    public void A_link_needs_both_a_label_and_a_url()
    {
        var ok = Validate(c => WithLinks(c, new CaseLink { Url = "https://example.com", Label = "Read it" }));
        Assert.True(ok.CanPublish, string.Join("\n", ok.Errors.Select(e => e.Problem)));

        var blank = Validate(c => WithLinks(c, new CaseLink { Url = "https://example.com", Label = "   " }));
        Assert.False(blank.CanPublish);
        Assert.Contains(blank.Errors, e => e.Problem.Contains("no label"));

        var noUrl = Validate(c => WithLinks(c, new CaseLink { Url = "", Label = "Somewhere" }));
        Assert.False(noUrl.CanPublish);
        Assert.Contains(noUrl.Errors, e => e.Problem.Contains("no url"));
    }

    /// <summary>
    /// A bare host reads fine to a human but resolves against the site's own
    /// origin, so the button 404s on the wrong domain instead of going where it
    /// was meant to — which is exactly the kind of fault nobody sees in a log.
    /// </summary>
    [Fact]
    public void A_link_url_must_carry_its_protocol()
    {
        var result = Validate(c => WithLinks(c, new CaseLink { Url = "example.com/thing", Label = "Read it" }));

        Assert.False(result.CanPublish);
        Assert.Contains(result.Errors, e => e.Problem.Contains("must start with http:// or https://"));
    }

    /// <summary>Two buttons pointing at the same place is odd but publishable.</summary>
    [Fact]
    public void Duplicate_link_urls_are_only_a_warning()
    {
        var result = Validate(c => WithLinks(c,
            new CaseLink { Url = "https://example.com/a", Label = "One" },
            new CaseLink { Url = "https://example.com/a", Label = "Two" }));

        Assert.True(result.CanPublish);
        Assert.Contains(result.Warnings, w => w.Problem.Contains("more than once"));
    }

    /// <summary>An empty list publishes <c>"links": []</c>, which the site's
    /// build check rejects — so the CMS has to refuse it first.</summary>
    [Fact]
    public void An_empty_link_list_is_an_error()
    {
        var result = Validate(c => c.Cases[0].Links = []);

        Assert.False(result.CanPublish);
        Assert.Contains(result.Errors, e => e.Problem.Contains("links is empty"));
    }

    [Fact]
    public void A_gallery_frame_that_is_not_in_the_repo_is_an_error()
    {
        var slug = Load().Content.Cases[0].Slug;

        var ok = ValidateWithFiles(slug, ["01.jpg", "02.jpg"],
            c => WithGallery(c, new GalleryImage { File = "01.jpg" }, new GalleryImage { File = "02.jpg", Caption = "Two" }));
        Assert.True(ok.CanPublish, string.Join("\n", ok.Errors.Select(e => e.Problem)));

        var missing = ValidateWithFiles(slug, ["01.jpg"],
            c => WithGallery(c, new GalleryImage { File = "01.jpg" }, new GalleryImage { File = "nope.jpg" }));
        Assert.False(missing.CanPublish);
        Assert.Contains(missing.Errors, e => e.Problem == $"no image at public/gallery/{slug}/nope.jpg");
    }

    /// <summary>
    /// A path would resolve somewhere neither this validator nor
    /// scripts/check-content.mjs looks, so it has to be refused at the field
    /// rather than discovered as a broken image in production.
    /// </summary>
    [Fact]
    public void A_gallery_file_must_be_a_bare_filename()
    {
        var slug = Load().Content.Cases[0].Slug;

        var result = ValidateWithFiles(slug, ["01.jpg"],
            c => WithGallery(c, new GalleryImage { File = "sub/01.jpg" }));

        Assert.False(result.CanPublish);
        Assert.Contains(result.Errors, e => e.Problem.Contains("must be a bare filename"));
    }

    /// <summary>An empty list publishes <c>"gallery": []</c>, which the site's
    /// build check rejects — so the CMS has to refuse it first.</summary>
    [Fact]
    public void An_empty_gallery_is_an_error()
    {
        var result = Validate(c => c.Cases[0].Gallery = []);

        Assert.False(result.CanPublish);
        Assert.Contains(result.Errors, e => e.Problem.Contains("gallery is empty"));
    }

    /// <summary>
    /// The one this check really exists for: an uploaded photograph nobody
    /// listed is invisible — nothing breaks, nothing logs, it just never
    /// appears. A warning rather than an error, because keeping a source file
    /// or an alternate crop in the folder is legitimate.
    /// </summary>
    [Fact]
    public void Images_in_the_folder_that_the_gallery_does_not_list_are_a_warning()
    {
        var slug = Load().Content.Cases[0].Slug;

        var partial = ValidateWithFiles(slug, ["01.jpg", "02.jpg", "03.jpg"],
            c => WithGallery(c, new GalleryImage { File = "01.jpg" }));
        Assert.True(partial.CanPublish);
        Assert.Contains(partial.Warnings, w => w.Problem.Contains("02.jpg, 03.jpg"));

        // …and the same folder with no gallery field at all is worth saying out
        // loud too, since that is what an upload-then-forget looks like.
        var none = ValidateWithFiles(slug, ["01.jpg"], c => c.Cases[0].Gallery = null);
        Assert.True(none.CanPublish);
        Assert.Contains(none.Warnings, w => w.Problem.Contains("the case has no gallery"));
    }
}

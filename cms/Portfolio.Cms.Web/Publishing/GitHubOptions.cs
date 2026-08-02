using System.ComponentModel.DataAnnotations;

namespace Portfolio.Cms.Web.Publishing;

/// <summary>
/// Where publishing sends its commits. Bound from configuration — on App
/// Service these come from application settings, never from a committed file.
/// </summary>
public sealed class GitHubOptions
{
    public const string SectionName = "GitHub";

    [Required] public string Owner { get; set; } = "";
    [Required] public string Repository { get; set; } = "";

    /// <summary>
    /// The branch GitHub Pages builds from. This repo deploys from
    /// <c>claude/cleanup-refactor</c> rather than main (see
    /// .github/workflows/deploy.yml), so it is configuration, not a constant —
    /// pushing to the wrong branch would publish nothing and look like success.
    /// </summary>
    [Required] public string Branch { get; set; } = "";

    /// <summary>
    /// Fine-grained personal access token with Contents: read and write on this
    /// repository alone. Nothing else is needed — the CMS never opens pull
    /// requests, reads issues or touches other repositories.
    /// </summary>
    [Required] public string Token { get; set; } = "";

    public string CommitAuthorName { get; set; } = "Portfolio CMS";
    public string CommitAuthorEmail { get; set; } = "cms@merijnkersten.nl";

    /// <summary>Sent as the User-Agent; GitHub requires one.</summary>
    public string UserAgent { get; set; } = "portfolio-cms";
}

using System.Security.Claims;
using System.Text.Encodings.Web;
using Microsoft.AspNetCore.Authentication;
using Microsoft.Extensions.Options;

namespace Portfolio.Cms.Web;

/// <summary>
/// Signs every request in as a local developer.
/// <para>
/// Entra can't be configured before there is an app registration to point at,
/// and requiring one to run the editor locally would make the first hour of the
/// project about Azure rather than about content. So when
/// <c>AzureAd:ClientId</c> is absent the app uses this instead.
/// </para>
/// <para>
/// Program.cs refuses to start outside Development without a client id, so this
/// cannot become the production path by omission — which is the failure mode
/// worth designing against, given the app can commit to a public repository.
/// </para>
/// </summary>
public sealed class LocalDevAuthHandler(
    IOptionsMonitor<AuthenticationSchemeOptions> options,
    ILoggerFactory logger,
    UrlEncoder encoder)
    : AuthenticationHandler<AuthenticationSchemeOptions>(options, logger, encoder)
{
    public const string SchemeName = "LocalDev";

    protected override Task<AuthenticateResult> HandleAuthenticateAsync()
    {
        var identity = new ClaimsIdentity(
            [new Claim(ClaimTypes.Name, "local development"), new Claim("preferred_username", "dev@localhost")],
            SchemeName);

        return Task.FromResult(AuthenticateResult.Success(
            new AuthenticationTicket(new ClaimsPrincipal(identity), SchemeName)));
    }
}

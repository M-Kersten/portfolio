using Portfolio.Cms.Web;
using Azure.Identity;
using Azure.Storage.Blobs;
using Microsoft.AspNetCore.Authentication.OpenIdConnect;
using Microsoft.EntityFrameworkCore;
using Microsoft.Identity.Web;
using Microsoft.Identity.Web.UI;
using Portfolio.Cms.Web.Components;
using Portfolio.Cms.Web.Data;
using Portfolio.Cms.Web.Publishing;
using Portfolio.Cms.Web.Storage;

var builder = WebApplication.CreateBuilder(args);
var config = builder.Configuration;

// ── Authentication ──────────────────────────────────────────────────────────
// Entra ID, and then an allow-list on top. Being signed in to a tenant is not
// the same as being allowed to publish: this app commits to a public
// repository, so the bar is "is this the owner", not "is this a valid user".
//
// Entra can't be configured before the app exists to register, so with no
// client id the app runs unauthenticated — but only ever in Development. In any
// other environment a missing client id is a misconfiguration that must not
// quietly resolve to "no login required".
var entraConfigured = !string.IsNullOrWhiteSpace(config["AzureAd:ClientId"]);
if (!entraConfigured && !builder.Environment.IsDevelopment())
    throw new InvalidOperationException(
        "AzureAd:ClientId is not set. The CMS commits to a public repository and will not "
        + "start without authentication outside Development.");

var allowed = config.GetSection("Cms:AllowedUsers").Get<string[]>() ?? [];

if (entraConfigured)
{
    builder.Services
        .AddAuthentication(OpenIdConnectDefaults.AuthenticationScheme)
        .AddMicrosoftIdentityWebApp(config.GetSection("AzureAd"));

    builder.Services.AddAuthorizationBuilder()
        .SetFallbackPolicy(new Microsoft.AspNetCore.Authorization.AuthorizationPolicyBuilder()
            .RequireAuthenticatedUser()
            .RequireAssertion(context =>
            {
                // An empty allow-list means a fresh deployment nobody has locked
                // down yet. Denying everyone is the safe reading — it must not
                // mean "anyone with a Microsoft account".
                if (allowed.Length == 0) return false;
                var identifiers = context.User.Claims
                    .Where(c => c.Type is "preferred_username" or "email" or ClaimConstants.ObjectId)
                    .Select(c => c.Value);
                return identifiers.Any(id => allowed.Contains(id, StringComparer.OrdinalIgnoreCase));
            })
            .Build());
}
else
{
    builder.Services.AddAuthentication(LocalDevAuthHandler.SchemeName)
        .AddScheme<Microsoft.AspNetCore.Authentication.AuthenticationSchemeOptions, LocalDevAuthHandler>(
            LocalDevAuthHandler.SchemeName, null);
    builder.Services.AddAuthorizationBuilder()
        .SetFallbackPolicy(new Microsoft.AspNetCore.Authorization.AuthorizationPolicyBuilder()
            .RequireAssertion(_ => true)
            .Build());
}

builder.Services.AddRazorComponents().AddInteractiveServerComponents();
builder.Services.AddCascadingAuthenticationState();
builder.Services.AddControllersWithViews().AddMicrosoftIdentityUI();

// ── Draft store ─────────────────────────────────────────────────────────────
// Azure SQL in production. Falling back to a local SQLite file keeps the whole
// app runnable before any Azure resource exists, which matters when the point
// of the project is learning the Azure parts one at a time.
var sqlConnection = config.GetConnectionString("Cms");
builder.Services.AddDbContext<CmsDbContext>(options =>
{
    // EnableRetryOnFailure is not optional against this database. It is
    // serverless with a 60-minute auto-pause, and a paused database answers its
    // first connections with transient errors for tens of seconds while it
    // resumes. Without a retry strategy the very first query after an idle
    // period simply throws.
    if (!string.IsNullOrWhiteSpace(sqlConnection))
        options.UseSqlServer(sqlConnection, sql => sql.EnableRetryOnFailure(
            maxRetryCount: 8,
            maxRetryDelay: TimeSpan.FromSeconds(15),
            errorNumbersToAdd: null));
    else options.UseSqlite($"Data Source={Path.Combine(builder.Environment.ContentRootPath, "cms-draft.db")}");
});
builder.Services.AddScoped<ContentStore>();
// The schema is created in the background at start-up rather than before the
// app starts listening — see SchemaGate for why that distinction is the whole
// difference between a working cold start and a 503.
builder.Services.AddSingleton<SchemaGate>();
builder.Services.AddHostedService<SchemaInitializer>();

// ── Publishing ──────────────────────────────────────────────────────────────
var github = builder.Services.AddOptions<GitHubOptions>()
    .Bind(config.GetSection(GitHubOptions.SectionName))
    .ValidateDataAnnotations();

// Fail at start-up rather than halfway through a commit — but only where the
// app is actually expected to publish. Locally the editor is worth running
// against a draft database before any token exists.
if (!builder.Environment.IsDevelopment()) github.ValidateOnStart();
builder.Services.AddScoped<GitHubRepository>();
builder.Services.AddScoped<PublishService>();

// ── Poster staging ──────────────────────────────────────────────────────────
var storageConnection = config.GetConnectionString("Storage");
var storageUri = config["Storage:ServiceUri"];
var posterContainer = config["Storage:Container"] ?? "pending-posters";

builder.Services.AddScoped<PosterStore>(sp =>
{
    var loggers = sp.GetRequiredService<ILoggerFactory>();

    if (!string.IsNullOrWhiteSpace(storageConnection))
        return new BlobPosterStore(
            new BlobContainerClient(storageConnection, posterContainer),
            loggers.CreateLogger<BlobPosterStore>());

    // Managed identity — no key in configuration at all, which is the point of
    // preferring it once the app is actually on App Service.
    if (!string.IsNullOrWhiteSpace(storageUri))
        return new BlobPosterStore(
            new BlobServiceClient(new Uri(storageUri), new DefaultAzureCredential())
                .GetBlobContainerClient(posterContainer),
            loggers.CreateLogger<BlobPosterStore>());

    return new LocalPosterStore(
        Path.Combine(builder.Environment.ContentRootPath, "pending-posters"),
        loggers.CreateLogger<LocalPosterStore>());
});

var app = builder.Build();

if (!app.Environment.IsDevelopment())
{
    app.UseExceptionHandler("/Error", createScopeForErrors: true);
    app.UseHsts();
}

app.UseHttpsRedirection();
app.UseAuthentication();
app.UseAuthorization();
app.UseAntiforgery();

app.MapStaticAssets();
app.MapControllers();
app.MapRazorComponents<App>().AddInteractiveServerRenderMode();

app.Run();

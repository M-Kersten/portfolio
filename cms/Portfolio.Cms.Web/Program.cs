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
builder.Services
    .AddAuthentication(OpenIdConnectDefaults.AuthenticationScheme)
    .AddMicrosoftIdentityWebApp(config.GetSection("AzureAd"));

var allowed = config.GetSection("Cms:AllowedUsers").Get<string[]>() ?? [];
builder.Services.AddAuthorizationBuilder()
    .SetFallbackPolicy(new Microsoft.AspNetCore.Authorization.AuthorizationPolicyBuilder()
        .RequireAuthenticatedUser()
        .RequireAssertion(context =>
        {
            // No allow-list configured means a fresh deployment nobody has
            // locked down yet. Denying everyone is the safe reading — an empty
            // list must not mean "anyone with a Microsoft account".
            if (allowed.Length == 0) return false;
            var identifiers = context.User.Claims
                .Where(c => c.Type is "preferred_username" or "email" or ClaimConstants.ObjectId)
                .Select(c => c.Value);
            return identifiers.Any(id => allowed.Contains(id, StringComparer.OrdinalIgnoreCase));
        })
        .Build());

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
    if (!string.IsNullOrWhiteSpace(sqlConnection)) options.UseSqlServer(sqlConnection);
    else options.UseSqlite($"Data Source={Path.Combine(builder.Environment.ContentRootPath, "cms-draft.db")}");
});
builder.Services.AddScoped<ContentStore>();

// ── Publishing ──────────────────────────────────────────────────────────────
builder.Services.AddOptions<GitHubOptions>()
    .Bind(config.GetSection(GitHubOptions.SectionName))
    .ValidateDataAnnotations()
    // Fail at start-up rather than on the first publish: a missing token should
    // not present itself as a mysterious failure halfway through a commit.
    .ValidateOnStart();
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

// The draft schema is created on start-up rather than through a migration step.
// There is one user and one database, and the content of record lives in git —
// so the cost of being wrong here is re-importing, not losing anything.
using (var scope = app.Services.CreateScope())
    await scope.ServiceProvider.GetRequiredService<CmsDbContext>().Database.EnsureCreatedAsync();

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

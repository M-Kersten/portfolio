using Microsoft.EntityFrameworkCore;

namespace Portfolio.Cms.Web.Data;

/// <summary>
/// Signals when the draft schema exists, so creating it can happen off the
/// start-up path.
/// <para>
/// It used to happen ON the start-up path — an <c>EnsureCreatedAsync()</c>
/// awaited between <c>builder.Build()</c> and <c>app.Run()</c>, so the app did
/// not begin listening until the database answered. That is fine against a
/// database that is already awake and fatal against this one. The draft lives
/// on serverless Azure SQL with a 60-minute auto-pause, and the app itself is
/// on an F1 plan with no Always On, so the overwhelmingly common request is the
/// one that arrives at a cold app AND a paused database. Resuming takes tens of
/// seconds and the first connections fail outright while it happens, so
/// start-up either threw or outran App Service's start limit — and the platform
/// answered 503. Try again once the database had woken and everything worked,
/// which is exactly the "it doesn't want to spin up" shape.
/// </para>
/// <para>
/// Now the app binds immediately and can serve the sign-in redirect while the
/// database wakes behind it — and since the Entra round-trip takes a few
/// seconds of its own, the resume is usually over before anything needs a row.
/// Anything that does touch the database awaits <see cref="Ready"/> first, so
/// no request can race ahead of the schema.
/// </para>
/// </summary>
public sealed class SchemaGate
{
    private readonly TaskCompletionSource _ready = new(TaskCreationOptions.RunContinuationsAsynchronously);

    /// <summary>Completes once the schema exists; faults if it cannot be created.</summary>
    public Task Ready => _ready.Task;

    internal void Done() => _ready.TrySetResult();

    internal void Failed(Exception error) => _ready.TrySetException(error);
}

/// <summary>
/// Creates the draft schema in the background, once, at start-up.
/// </summary>
/// <remarks>
/// A plain <see cref="IHostedService"/> rather than a <c>BackgroundService</c>:
/// the host awaits <c>StartAsync</c> before it starts listening, so the work
/// has to be handed to the thread pool and the method has to return straight
/// away. Awaiting it here would put the block back exactly where it was.
/// </remarks>
public sealed class SchemaInitializer(
    IServiceProvider services,
    SchemaGate gate,
    ILogger<SchemaInitializer> log) : IHostedService
{
    public Task StartAsync(CancellationToken cancellationToken)
    {
        _ = Task.Run(async () =>
        {
            try
            {
                using var scope = services.CreateScope();
                var db = scope.ServiceProvider.GetRequiredService<CmsDbContext>();
                // The retry strategy configured on the provider is what actually
                // absorbs a resuming serverless database: the first connections
                // come back as transient failures for tens of seconds.
                await db.Database.EnsureCreatedAsync(CancellationToken.None);
                log.LogInformation("Draft schema ready.");
                gate.Done();
            }
            catch (Exception ex)
            {
                // Fault the gate rather than swallowing: a page that needs the
                // database should surface this, and the app staying up means
                // the error is readable instead of being a platform 503.
                log.LogError(ex, "Could not create the draft schema.");
                gate.Failed(ex);
            }
        }, CancellationToken.None);

        return Task.CompletedTask;
    }

    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;
}

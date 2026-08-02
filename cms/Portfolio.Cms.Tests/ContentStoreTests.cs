using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Portfolio.Cms.Core.Json;
using Portfolio.Cms.Core.Models;
using Portfolio.Cms.Web.Data;

namespace Portfolio.Cms.Tests;

/// <summary>
/// The draft store sits between the editor and the published file, so anything
/// it loses is lost silently: the content goes into the database intact and
/// comes out of a publish subtly wrong. These check the trip through is lossless
/// — the same standard as the file round-trip, extended one layer down.
/// <para>
/// Run against SQLite in memory rather than Azure SQL. The schema is plain
/// enough that the provider difference doesn't matter here, and it keeps the
/// tests runnable with no connection string.
/// </para>
/// </summary>
public class ContentStoreTests : IDisposable
{
    private readonly SqliteConnection _connection;
    private readonly DbContextOptions<CmsDbContext> _options;

    public ContentStoreTests()
    {
        // Held open deliberately: an in-memory SQLite database lives exactly as
        // long as its connection.
        _connection = new SqliteConnection("DataSource=:memory:");
        _connection.Open();
        _options = new DbContextOptionsBuilder<CmsDbContext>().UseSqlite(_connection).Options;

        using var db = new CmsDbContext(_options);
        db.Database.EnsureCreated();
    }

    public void Dispose() => _connection.Dispose();

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

    private CmsDbContext NewContext() => new(_options);

    private async Task<ContentSet> ImportThenLoadAsync()
    {
        await using (var db = NewContext())
            await new ContentStore(db).ImportFromCheckoutAsync(RepoRoot);

        await using var read = NewContext();
        return await new ContentStore(read).LoadAsync();
    }

    /// <summary>
    /// The whole point: content imported from the repo and read back must
    /// render to exactly the same files. Compared as rendered text rather than
    /// object graphs so a dropped optional field can't hide behind a default.
    /// </summary>
    [Fact]
    public async Task Import_then_load_renders_identical_files()
    {
        var fromDatabase = (await ImportThenLoadAsync()).Serialize();
        var fromFiles = ContentSet.LoadFrom(RepoRoot).Serialize();

        Assert.Equal(fromFiles.Keys.Order(), fromDatabase.Keys.Order());
        foreach (var (path, expected) in fromFiles)
            Assert.True(expected == fromDatabase[path],
                $"{path} differs after a round trip through the database.");
    }

    [Fact]
    public async Task Case_order_survives_the_round_trip()
    {
        var loaded = await ImportThenLoadAsync();
        var expected = ContentSet.LoadFrom(RepoRoot).Cases.Select(c => c.Slug);

        // cases.json is rendered in array order, so losing it would silently
        // reshuffle the site.
        Assert.Equal(expected, loaded.Cases.Select(c => c.Slug));
    }

    /// <summary>
    /// Absent and false mean the same thing to the site, but only absent keeps
    /// the key out of the JSON — so a nullable bool that comes back as `false`
    /// would add `"archive": false` to twelve cases.
    /// </summary>
    [Fact]
    public async Task Unset_optional_flags_stay_unset()
    {
        var loaded = await ImportThenLoadAsync();

        Assert.All(loaded.Cases.Where(c => c.Archive != true), c => Assert.Null(c.Archive));
        Assert.Equal(4, loaded.Cases.Count(c => c.Archive == true));
        // cv.json carries no career overrides; cv.nl.json carries nine.
        Assert.Null(loaded.Cv.Career);
        Assert.Equal(9, loaded.CvNl.Career?.Count);
    }

    [Fact]
    public async Task Saving_again_updates_rows_rather_than_replacing_them()
    {
        await using (var db = NewContext())
            await new ContentStore(db).ImportFromCheckoutAsync(RepoRoot);

        int[] idsBefore;
        await using (var db = NewContext())
            idsBefore = await db.Cases.OrderBy(c => c.Position).Select(c => c.Id).ToArrayAsync();

        await using (var db = NewContext())
        {
            var store = new ContentStore(db);
            var content = await store.LoadAsync();
            content.Cases[0].Title = "An edited title";
            await store.SaveAsync(content);
        }

        await using (var db = NewContext())
        {
            var idsAfter = await db.Cases.OrderBy(c => c.Position).Select(c => c.Id).ToArrayAsync();
            Assert.Equal(idsBefore, idsAfter);
            Assert.Equal("An edited title", (await db.Cases.OrderBy(c => c.Position).FirstAsync()).Title);
        }
    }

    [Fact]
    public async Task Deleting_a_case_removes_its_row()
    {
        await using (var db = NewContext())
            await new ContentStore(db).ImportFromCheckoutAsync(RepoRoot);

        await using (var db = NewContext())
        {
            var store = new ContentStore(db);
            var content = await store.LoadAsync();
            content.Cases.RemoveAt(0);
            await store.SaveAsync(content);
        }

        await using (var db = NewContext())
            Assert.Equal(15, await db.Cases.CountAsync());
    }

    [Fact]
    public async Task Loading_before_an_import_says_what_to_do()
    {
        await using var db = NewContext();

        var store = new ContentStore(db);
        Assert.True(await store.IsEmptyAsync());

        var error = await Assert.ThrowsAsync<InvalidOperationException>(() => store.LoadAsync());
        Assert.Contains("import", error.Message, StringComparison.OrdinalIgnoreCase);
    }
}

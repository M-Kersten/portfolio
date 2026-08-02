using Microsoft.EntityFrameworkCore;

namespace Portfolio.Cms.Web.Data;

/// <summary>
/// The CMS draft store.
/// <para>
/// Worth being clear about what this database is for: it is not the source of
/// truth. The repository is — the site builds from committed JSON, and would
/// keep building if this database vanished. What lives here is the working
/// draft between publishes, so an edit can be saved, revisited and validated
/// before it becomes a commit.
/// </para>
/// </summary>
public class CmsDbContext(DbContextOptions<CmsDbContext> options) : DbContext(options)
{
    public DbSet<CaseRecord> Cases => Set<CaseRecord>();
    public DbSet<DocumentRecord> Documents => Set<DocumentRecord>();
    public DbSet<PublishRecord> Publishes => Set<PublishRecord>();

    protected override void OnModelCreating(ModelBuilder model)
    {
        model.Entity<CaseRecord>(e =>
        {
            // Slugs are the site's identity for a case — they appear in the 3D
            // hotspots, the poster filenames and the `follows` links — so a
            // duplicate is a data error the database should refuse outright,
            // not something only the validator catches.
            e.HasIndex(c => c.Slug).IsUnique();
            e.HasIndex(c => c.Position);
        });

        model.Entity<DocumentRecord>(e =>
            // Stored as text so a human reading the table sees "Site" rather
            // than "0", and so reordering the enum can't silently repoint rows.
            e.Property(d => d.Key).HasConversion<string>().HasMaxLength(20));

        model.Entity<PublishRecord>(e =>
            e.HasIndex(p => p.PublishedAt));
    }
}

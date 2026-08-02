# Portfolio CMS

An ASP.NET Core admin app for editing the portfolio's content. Full setup,
architecture and cost notes live in [`docs/cms.md`](../docs/cms.md).

```
Portfolio.Cms.Core     domain model, JSON reader/writer, validation
Portfolio.Cms.Web      Blazor Server admin, EF Core store, GitHub publishing
Portfolio.Cms.Tests    round-trip, validation and draft-store tests
infra/main.bicep       App Service F1, Azure SQL free tier, Blob Storage
```

## Run it

```bash
dotnet run --project Portfolio.Cms.Web
dotnet test
```

With no configuration it uses a local SQLite file, stages posters on disk, and
signs you in as a local developer. Publishing needs a GitHub token; without one
the publish page says so instead of failing.

## The bit that is easy to break

`Portfolio.Cms.Core/Json/ContentWriter.cs` reproduces the repo's hand-formatting
of the content files — which containers sit on one line, and the relaxed
escaping that keeps literal UTF-8 out of `\u` escapes. `RoundTripTests` pins the
output byte for byte against the real files and enumerates the only nine lines
that are allowed to differ. If those tests fail, a publish is about to write a
thousand-line diff.

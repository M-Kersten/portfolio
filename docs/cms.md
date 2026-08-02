# The CMS

An admin app for editing the site's content without hand-editing JSON. It lives
in [`cms/`](../cms) and is deployed separately from the site.

## How it fits together

The site does not change. It is still a static Vite build on GitHub Pages, built
from the JSON committed in `src/content/`. The CMS does not sit in front of it
and the site never calls it:

```
  edit in the CMS  →  draft in Azure SQL  →  Publish  →  commit to the repo
                                                              ↓
                                              GitHub Actions builds Pages
```

Publishing writes a commit; the existing `deploy.yml` workflow does the rest, so
the site is live about a minute later. The consequence worth knowing is that
**the repository is still the source of truth**. If the CMS is asleep, broken or
deleted, `portfolio.merijnkersten.nl` is unaffected, and hand-editing the JSON
directly still works exactly as before. The database only holds the draft
between edits and a publish.

## What it can't edit

The 3D maquette is code, not content. Each hotspot in `src/scene/framing.ts` is
a hand-placed position with its own camera framing (`offset`, `aimDown`,
`fovZoom`, `mobileLift`), attached to an object modelled in `city.tsx`,
`room.tsx` or `chip.tsx`. The relation cables in `signals.tsx` are similarly
hand-drawn between named slugs.

So a project created in the CMS appears in the `/projects` index, its case
dialog, search, the sitemap and the CV — but **not in the hero maquette**.
Putting it there is a change to the scene, made by hand. This is already the
normal state: two curated projects have no hotspot today and work fine.

The coupling runs the other way too, and that one bites. `check-content.mjs`
fails the build if a hotspot names a slug with no case, so **a project that has
a hotspot cannot be deleted from the CMS**. The publish check reports it and
names the file to fix.

## Cost

Everything sits in a permanently free tier, not a trial.

| Service | Tier | Allowance | Actual use | Cost |
| --- | --- | --- | --- | --- |
| Azure SQL | [Free offer](https://learn.microsoft.com/azure/azure-sql/database/free-offer) | 100k vCore-sec + 32 GB / month, lifetime of subscription | ~55 KB, minutes a month | €0 |
| App Service | F1 | 60 CPU-min/day, 1 GB RAM | occasional | €0 |
| Blob Storage | Hot | $0.018/GB/month | 1.2 MB | ~€0.00 |
| Entra ID | Free | included | 1 user | €0 |

Two things to watch:

- **The SQL free offer must be selected explicitly** — that is the `useFreeLimit`
  flag in the Bicep. Provisioning a database through the default flow lands on a
  paid tier instead.
- Azure alerts but does not hard-cap on pay-as-you-go, so set a budget alert
  (Cost Management → Budgets) at ~€5. It is the only guardrail.

F1 has no Always On, so the admin cold-starts after idling and you get an
`azurewebsites.net` hostname rather than a custom domain. For a tool opened a
few times a month that is a fair trade; **B1 at ~€12/month** is the upgrade that
removes both. Nothing else needs to change — SQL stays free at any scale this
will reach.

## Deploying it

### 1. Azure resources

```bash
az group create -n portfolio-cms -l westeurope
az deployment group create -g portfolio-cms -f cms/infra/main.bicep \
  -p sqlAdminLogin=<user> sqlAdminPassword=<password>
```

This creates the App Service, the SQL server and free-tier database, the storage
account, and a system-assigned identity with blob access — so no storage key is
ever put in configuration. Note the `entraRedirectUri` output.

### 2. Entra app registration

Register a single-tenant app, add the `entraRedirectUri` from the deployment as
a **Web** redirect URI, and note the client and tenant ids.

### 3. GitHub token

A fine-grained personal access token, scoped to this repository alone, with
**Contents: read and write**. Nothing else — the CMS never opens pull requests
or reads issues.

### 4. App settings

```bash
az webapp config appsettings set -g portfolio-cms -n merijn-cms --settings \
  AzureAd__TenantId=<tenant-id> \
  AzureAd__ClientId=<client-id> \
  Cms__AllowedUsers__0=<your-email> \
  GitHub__Token=<pat> \
  GitHub__Branch=claude/cleanup-refactor
```

`GitHub__Branch` matters: this repo's Pages workflow builds from
`claude/cleanup-refactor`, not `main`. Publishing to the wrong branch would
change nothing and look like success.

`Cms__AllowedUsers` is an allow-list on top of Entra — being signed in to a
tenant is not the same as being allowed to commit to a public repository. **An
empty list denies everyone**, deliberately: a fresh deployment must not resolve
to "anyone with a Microsoft account".

### 5. Deploy and import

```bash
cd cms && dotnet publish Portfolio.Cms.Web -c Release -o ./publish
az webapp deploy -g portfolio-cms -n merijn-cms --src-path ./publish --type zip
```

Then open the app and use **Import from the repository** on the overview page —
the content already exists, so the first run reads it in rather than asking you
to retype it.

## Running it locally

No Azure account needed:

```bash
cd cms && dotnet run --project Portfolio.Cms.Web
```

With no configuration it falls back to a local SQLite file, stages posters on
disk, and signs you in as a local developer. `Program.cs` refuses to start
without Entra outside `Development`, so that fallback cannot become the
production path by omission.

Publishing still needs a `GitHub:Token` — set it in user secrets. Without one
the publish page says so rather than failing.

## Notes on the content itself

**Formatting.** The content files are hand-formatted — no prettier in the repo,
nothing in the build touches their layout. Most containers are expanded but
small tabular ones sit on one line, and `JSON.stringify(x, null, 2)` would turn
site.json from 66 lines into 267. The writer reproduces the existing layout per
path, so a publish diff shows only what changed.

**A one-time normalization.** The first publish will also change nine lines it
did not have to: four in `cases.json` where two projects' `kind` key moves to
the majority position, and three in `site.json` — a stray space before a comma
on the Marechaussee career entry, and a blank line inside `about.body`. Both are
insignificant whitespace. Review that first diff, then every later one is clean.

**`kind` is not validated by the build.** `types.ts` declares
`kind?: 'freelance' | 'passion'`, but the content also holds `"Freelance"`,
`"Research"` and `"graduation"` — `check-content.mjs` never checks the field.
`CaseCard.tsx` compares case-sensitively, so `zwijsen-ar-books` currently
renders as client work instead of showing its lavender Freelance badge. The CMS
warns about all three rather than rewriting them; fixing them is a content
decision, and `"Research"` and `"graduation"` have no corresponding label or
colour to fall back on.

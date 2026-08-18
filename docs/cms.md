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

### If it answers 503

The two free tiers compound. The app unloads after about 20 minutes idle, and
the database auto-pauses after 60, so the ordinary request is the one that
arrives at a cold app *and* a paused database. Resuming the database takes tens
of seconds, and while it happens its first connections fail outright.

That used to be fatal, because the app created its schema *before* it started
listening: start-up either threw on those failing connections or outran App
Service's start limit, and the platform answered 503. Trying again a minute
later worked, which made it look like the site refused to spin up on demand.

Two things fixed it, both in the app rather than the plan:

- the schema is created in the background (`SchemaGate`), so the app binds
  straight away and serves the sign-in redirect while the database wakes behind
  it — and the Entra round-trip usually covers the resume;
- the SQL provider has a retry strategy, which is not optional against a
  serverless database.

So a cold start is now **slow on the first page, not broken**. If you see a real
503 again, check the F1 daily CPU quota (60 minutes/day, after which the app is
stopped until UTC midnight) and the SQL free allowance — `freeLimitExhaustionBehavior`
is set to `AutoPause`, so an exhausted monthly allowance stops the database
rather than billing you.

## Deploying it

The template expects the SQL **server** to exist already and adopts it by name;
it creates the database on it, because that is where the free-tier flag lives.

### 1. Confirm the SQL server

Everything else has to go in the same resource group and region, so start here.
The deployed setup is:

| | |
| --- | --- |
| Resource group | `Default` |
| SQL server | `merijndatabasegermany` |
| Region | `germanywestcentral` |
| App | `merijn-cms` |

```bash
az sql server show -g Default -n merijndatabasegermany --query location -o tsv
az sql server ad-only-auth get -g Default -n merijndatabasegermany -o tsv
```

The Azure SQL free offer is only available in some regions; Germany West Central
is one. The database has to sit in the same region as its server, so that region
is the region for everything else too.

**There is no SQL password anywhere in this setup, by design.** The server uses
a Microsoft Entra admin (`info@merijnkersten.nl`), and the app authenticates
with the same system-assigned managed identity it uses for blob storage. Azure
stores SQL admin passwords write-only, so a password-based setup would have
meant resetting one and then keeping it in configuration forever; this way there
is nothing to reset, store or leak.

### 2. Azure resources

```bash
az deployment group create -g Default -f cms/infra/main.bicep \
  -p location=germanywestcentral \
     appLocation=westeurope \
     sqlServerName=merijndatabasegermany
```

This creates the App Service plan (F1), the app, the free-tier database, the
storage account, a firewall rule letting Azure services reach SQL, and a
system-assigned identity with access to both. No credentials are passed in and
none are stored. Note the `entraRedirectUri` output.

`location` and `appLocation` are separate on purpose. Only the database is tied
to the SQL server's region; the app can sit anywhere. That matters because App
Service compute quota is granted **per region per subscription**, and a personal
subscription routinely has a limit of zero VMs in one region and normal quota in
another — Germany West Central is one of the regions where that happens.

If the deployment fails on the App Service plan with:

```
Unauthorized … Operation cannot be completed without additional quota.
Current Limit (Total VMs): 0
```

that is the quota, not a permissions problem or the free tier. Move the app,
not the database — try `appLocation=westeurope`, then `northeurope`. What the
subscription is entitled to is worth knowing either way:

```bash
az account show --query "{name:name, state:state, type:subscriptionPolicies.quotaId}" -o table
```

A `quotaId` of `FreeTrial_*` means the trial credit is what is being used, and
it can expire into a state that allows free-tier services but grants no App
Service compute anywhere. Converting to pay-as-you-go lifts that and still costs
nothing at this scale — none of the resources here bill on their own. If every
region shows zero, that is the situation, and the fix is the subscription rather
than the template.

Then confirm the database really landed on the free tier, because this is the
difference between €0 and a bill, and the two look identical in the portal:

```bash
az sql db show -g Default -s merijndatabasegermany -n merijn-cms-db \
  --query "{free:useFreeLimit, behaviour:freeLimitExhaustionBehavior, sku:sku.name}" -o table
```

Expect `True`, `AutoPause`, `GP_S_Gen5`. Anything else means it is billing.

### 3. Let the app into the database

ARM gets the app as far as authenticating with its identity, but a managed
identity is not a database user until someone says so — and that grant is a
data-plane operation ARM cannot make. It is the one manual step here.

Open the Azure portal → **merijn-cms-db** → **Query editor**, sign in with
`info@merijnkersten.nl` (this is what being the Entra admin is for), and run
[`cms/infra/grant-managed-identity.sql`](../cms/infra/grant-managed-identity.sql):

```sql
CREATE USER [merijn-cms] FROM EXTERNAL PROVIDER;
ALTER ROLE db_datareader ADD MEMBER [merijn-cms];
ALTER ROLE db_datawriter ADD MEMBER [merijn-cms];
ALTER ROLE db_ddladmin  ADD MEMBER [merijn-cms];
```

Make sure the editor is connected to `merijn-cms-db` and not `master` — the
grant has to happen in the database itself. `db_ddladmin` is there because the
app creates its own schema on first start; `db_owner` would work too and grants
far more than this app needs.

### 4. Entra app registration

Register a single-tenant app, add the `entraRedirectUri` from the deployment as
a **Web** redirect URI, and note the client and tenant ids.

### 5. GitHub token

Create it at **GitHub → Settings → Developer settings → Personal access tokens →
Fine-grained tokens → Generate new token**:

- **Repository access:** Only select repositories → `m-kersten/portfolio`
- **Permissions:** Repository permissions → **Contents: Read and write**

Nothing else. The CMS never opens pull requests, reads issues or touches another
repository, so anything beyond Contents is access it cannot use.

Note the expiry you pick — when the token lapses, publishing starts failing with
a 401 and nothing else changes, which is a confusing symptom if the expiry has
been forgotten.

Then set it. **The key is spelled differently in the two places**, which is the
usual cause of a token that appears to be set and isn't:

```bash
# On App Service — double underscore, because environment variables cannot
# contain a colon and ASP.NET Core maps "__" onto the ":" of a config path.
az webapp config appsettings set -g Default -n merijn-cms \
  --settings GitHub__Token=github_pat_...

# Locally — a real colon, in user secrets rather than appsettings.json, which
# is committed.
cd cms/Portfolio.Cms.Web
dotnet user-secrets set "GitHub:Token" "github_pat_..."
```

Both land on the same `GitHub:Token` setting. To check what App Service actually
holds:

```bash
az webapp config appsettings list -g Default -n merijn-cms \
  --query "[?starts_with(name,'GitHub')].name" -o tsv
```

That lists the names without printing the values.

### 6. App settings

```bash
az webapp config appsettings set -g Default -n merijn-cms --settings \
  AzureAd__TenantId=<tenant-id> \
  AzureAd__ClientId=<client-id> \
  Cms__AllowedUsers__0=info@merijnkersten.nl \
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

### 7. Deploy and import

Check the runtime exists in your region before publishing — .NET 10 is recent
enough that it is worth confirming rather than discovering on a failed start:

```bash
az webapp list-runtimes --os linux | grep -i dotnet
```

```bash
cd cms
dotnet publish Portfolio.Cms.Web -c Release -o ./publish
cd publish && zip -r ../cms.zip . && cd ..
az webapp deploy -g Default -n merijn-cms --src-path cms.zip --type zip
```

Then open the app and use **Import from the repository** on the overview page —
the content already exists, so the first run reads it in rather than asking you
to retype it.

### 8. Test the publish path somewhere safe

The publish path has never talked to the real GitHub API. Point it at a
throwaway branch first, publish once, check the commit looks right, and only
then move it to the branch Pages builds from:

```bash
git push origin claude/cleanup-refactor:cms-publish-test
az webapp config appsettings set -g Default -n merijn-cms \
  --settings GitHub__Branch=cms-publish-test
```

The first publish is also the one that normalizes nine lines (see below), so
this is the diff worth reading properly.

## Running it locally

No Azure account needed:

```bash
cd cms && dotnet run --project Portfolio.Cms.Web
```

With no configuration it falls back to a local SQLite file, stages posters on
disk, and signs you in as a local developer. `Program.cs` refuses to start
without Entra outside `Development`, so that fallback cannot become the
production path by omission.

Publishing still needs a `GitHub:Token`:

```bash
cd cms/Portfolio.Cms.Web
dotnet user-secrets set "GitHub:Token" "github_pat_..."
```

Without one the publish page says so rather than failing, and Import falls back
to reading the checkout the app is running inside. With one, Import reads the
repository over the API — the same path the deployed app takes, which is worth
exercising locally before trusting it on App Service.

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

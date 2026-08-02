# CMS plan — a git-backed .NET admin for the case studies

## Goal

Make `src/content/cases.json` editable through a web UI instead of by hand,
without touching how the portfolio itself works. The live site stays a fully
static build on GitHub Pages; the CMS is a separate tool that is only ever
consulted when *editing* content, never when the site is served.

## Architecture

Git (this repo) is the database. There is no SQL server, no CMS runtime
dependency for the live site, and no new always-on host required for the
portfolio to keep working. The CMS is a small ASP.NET Core Web API + a React
admin SPA that reads and writes `cases.json` (and posters) straight to GitHub
via the Contents API. A commit *is* a publish — it lands on the existing
`claude/cleanup-refactor` deploy branch and the current GitHub Actions
workflow (`.github/workflows/deploy.yml`) builds and deploys it exactly as it
does today for hand-edited content.

```
cms/
├─ Mk.Cms.Api            ASP.NET Core, minimal APIs
│   GET  /api/cases           reads cases.json from GitHub (Octokit) + file SHA
│   PUT  /api/cases           validates → commits (requires SHA → 409 on conflict)
│   POST /api/posters/{slug}  multipart upload → ImageSharp (1024px, q78) → commit
│   GET  /api/deploy/status   latest Pages workflow run (green/red/running)
│   POST /api/auth/login      cookie auth, single admin
│   └─ serves the built admin SPA from wwwroot → one deployable, no CORS
└─ admin/                React + Vite + TS (same stack as the portfolio)
    └─ list view + case form: follows dropdown, tech tags, poster upload/preview
```

**Why this shape, specifically:**

- **No database.** SQLite/Postgres would add a stateful service to run,
  patch and back up for content that changes a few times a month. Git
  already gives every edit history and `git revert` as rollback.
- **The API exists for one reason: token custody.** The GitHub PAT must never
  reach the browser. A static admin page calling GitHub directly would put
  the token in the bundle. The API is the boundary — Octokit, ImageSharp,
  validation and the token all live server-side; the SPA only ever talks to
  `/api/*`.
- **React admin, not Blazor.** Same stack you already use daily on this
  repo (React + Vite + TS), and ASP.NET Core **Web API** is the more
  common .NET job-market skill than Blazor.
- **SHA-based optimistic concurrency, not a custom locking scheme.** GitHub's
  Contents API requires a file's current SHA to update it. `GET /api/cases`
  returns the content *and* its SHA (an ETag, effectively); `PUT` must send
  that SHA back and gets **409 Conflict** if the file changed underneath —
  e.g. someone hand-edited `cases.json` directly. This is the textbook
  If-Match/ETag pattern, not something bespoke.
- **`check-content.mjs` stays the final gate.** The CMS validates in the form
  for good UX, but CI's existing validator — required fields, year format,
  unique slugs, `follows` resolving, a poster on disk, and the rule that a
  case referenced by a 3D hotspot in `framing.ts` can't just vanish — still
  runs on every build regardless of where the change came from.
- **New cases show up on the timeline, `/projects` cloud and search
  automatically** (they all render off the `cases` array), **but not as new
  3D hotspots** — those are bespoke objects hand-built per slug in
  `scene/maquette/*.tsx`. That boundary is intentional and out of scope here.

## Phases

### Phase 0 — Scaffold + decisions (½ day)
- `dotnet new webapi` (or minimal API template) targeting current .NET LTS.
- Add `Octokit` and `SixLabors.ImageSharp` NuGet packages.
- `dotnet new vite-react-ts`-equivalent (plain `npm create vite@latest admin
  -- --template react-ts`) for the admin SPA.
- Decide hosting for now: **run locally** (`dotnet run`) when editing. No
  public hosting needed until/unless you want to edit from anywhere — the
  PAT never has to leave your machine in the meantime.
- Dev loop: `dotnet watch` for the API + Vite dev server for the admin, with
  a Vite proxy sending `/api/*` to Kestrel. Production build drops the Vite
  output into `wwwroot`, so the whole CMS is one deployable container later.

### Phase 1 — The git gateway (1 day, the core of it)
- `RepoContentService` wrapping Octokit: read `cases.json` from the deploy
  branch, deserialize into a C# `CaseStudy` record mirroring
  `src/content/types.ts` field-for-field (same names: `slug`, `layer`,
  `problem`, `approach`, `lesson`, `outcome`, `tech`, `follows`, `year`,
  `kind`, `tag`, `live`, `draft`, `archive`, `video`, `article`).
- Auth via a **fine-grained PAT** scoped to only this repo, contents
  read/write only. Store it with the options pattern + user-secrets
  (`dotnet user-secrets set GitHub:Token …`) — never in the repo.
- Implement the SHA round-trip: `GET` returns `{ cases, sha }`; `PUT`
  requires `sha` and fails with 409 if it's stale.
- Start with one commit per save (whole `cases.json` file). A later
  upgrade — one atomic commit for JSON + poster together via the Git Data
  API (blobs → tree → commit) — is optional polish, not required for v1.
- Rapid consecutive publishes are already handled downstream: the existing
  workflow's `concurrency: group: pages, cancel-in-progress: true` coalesces
  them into one deploy.

### Phase 2 — The admin editor (1 day)
- List page: title, layer badge, and live/draft/archive chips.
- Edit form covering every field: dropdowns for `layer`/`kind`, textareas
  for the three story beats (problem/approach/lesson), a tags input for
  `tech`, a `follows` dropdown populated from the other slugs, a
  regex-validated `year` field.
- **Slug is write-once** after a case is created — never editable afterward
  (posters, `follows`, and the 3D hotspots all key off it).
- Share the `CaseStudy` shape with the portfolio: either copy `types.ts`'s
  interface into the admin or extract it into a tiny shared package, so the
  admin form and the site agree on one schema.

### Phase 3 — Poster upload (½ day)
- `IFormFile` multipart upload → ImageSharp pipeline mirroring
  `scripts/optimize-posters.mjs` exactly: auto-orient from EXIF, resize to
  **max width 1024px without enlargement**, **JPEG quality 78** (the budget
  that matches how posters actually render — ~250 CSS px on cards, ~760 in
  the focus dialog, so 1024 covers retina with nothing wasted).
- Save as `public/posters/{slug}.jpg`, include in the same commit as the
  case edit, show a preview in the form before saving.

### Phase 4 — Guardrails (½ day)
- Port `scripts/check-content.mjs`'s rules to C# so the form catches
  everything CI would, before the commit: required title/problem/approach/
  outcome, year format, YouTube-only video URLs, duplicate slugs, `follows`
  pointing at a real slug.
- Relational guardrails specific to this site: fetch `src/scene/framing.ts`
  and regex out the hotspot slugs so the admin **refuses to delete or
  rename a case the 3D scene points at**, and warns when deleting a case
  that other cases `follow`.
- CI's validator remains the authoritative gate regardless — this is
  defense in depth, catching mistakes before the build does, not replacing
  it.

### Phase 5 — Publish UX (½ day)
- Conventional commit messages from the API (e.g. `content: update arcam`).
- A small status widget in the admin that polls the GitHub Actions API for
  the workflow run triggered by the commit — save, watch it go green,
  site's live. Teaches the Actions API as a side effect.

### Phase 6 — Hosting (½ day, only if/when wanted)
- Dockerfile → a small VPS or App Service tier.
- Cookie auth with a hashed admin password; PAT as an environment secret;
  HTTPS via Caddy or the platform's built-in TLS.
- Until this phase, `localhost` is a perfectly legitimate deployment target
  for a single-editor CMS — there's no requirement to host it earlier.

**Total: roughly 4 days of work**, spread across independently shippable
phases. Nothing in `src/`, `scripts/`, or `.github/workflows/deploy.yml` in
*this* repo changes — the CMS is additive and external to the portfolio's
own build.

## What this teaches / CV framing

Minimal API endpoint groups, DI + typed `HttpClient` registration for
Octokit, the options pattern + user-secrets for credential handling, cookie
auth for a same-origin SPA, `IFormFile` → ImageSharp media processing,
`ProblemDetails` + field-level validation the React form renders, and the
GitHub REST API (Contents API with SHA-based optimistic concurrency, Actions
API for status). The honest one-line pitch: *"a git-backed headless CMS in
ASP.NET Core — a React admin talking to a Web API that uses the GitHub
Contents API as its content store with SHA-based optimistic concurrency, an
ImageSharp media pipeline, and schema validation gating a CI/CD deploy."*

## Trade-offs accepted

- No polished media library, no rich-text editor (not needed — every field
  here is plain text), no multi-editor roles (single editor), no CMS product
  name recognition on a CV keyword scan.
- ~2 minutes of publish latency (the Actions build+deploy run) between
  saving in the admin and the change going live.
- New cases appear on the timeline, `/projects` cloud and search
  automatically, but never as new 3D hotspots — those stay hand-built.
- One new artifact to keep track of: the fine-grained GitHub PAT. Everything
  else (SQLite database, media storage, uptime) that a product CMS would
  require is deliberately avoided.

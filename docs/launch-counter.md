# The launch counter — global "how many visitors flew the rocket" odometer

A single number in a free-tier Supabase project. The site stays fully static;
the count shows on the launch site's invitation ("0042 flights by visitors so
far") and on the pad ("flight 0043"), and goes up by one at liftoff. With
nothing configured, or the project unreachable, it simply doesn't show: no
label, no errors.

Supabase pauses a free project that shows too little database activity over
a week, and the tally goes dark with it. A daily GitHub Action keeps it awake
(see "Staying awake" below).

Threat model: none, deliberately. The anon key is public by design. The only
writes anyone can make are "+1 launches" and "stamp the heartbeat". Someone
bored could curl the first in a loop and inflate the number. That's the
accepted trade for no backend of our own.

## Setup (~5 minutes)

1. **A project**: create one at [supabase.com](https://supabase.com) (free
   tier), or resume the old one (see "If the tally has gone dark").

2. **Paste this into the SQL editor** (SQL editor → New query → Run). It's
   safe to run again on a project that already has the counter: it only adds
   what's missing (the heartbeat, on the old project).

   ```sql
   -- the counter: one row per counter ('launches' is the one the site uses)
   create table if not exists public.counters (
     name text primary key,
     value bigint not null default 0
   );
   insert into public.counters (name, value) values ('launches', 0)
     on conflict (name) do nothing;

   -- anyone may read it; nobody may write to it directly
   alter table public.counters enable row level security;
   drop policy if exists "public read" on public.counters;
   create policy "public read" on public.counters for select using (true);

   -- the only way to write to it: +1, nothing else
   create or replace function public.record_launch()
   returns bigint
   language sql
   security definer
   set search_path = public
   as $$
     update public.counters set value = value + 1 where name = 'launches'
     returning value;
   $$;
   revoke all on function public.record_launch() from public;
   grant execute on function public.record_launch() to anon;

   -- the heartbeat: a daily stamp from GitHub Actions
   -- (.github/workflows/keep-counter-awake.yml), so the free project never looks
   -- idle long enough to be paused. Nobody reads or writes the table directly:
   -- the function is the only way in, and all it can do is stamp the time.
   create table if not exists public.heartbeat (
     id smallint primary key default 1 check (id = 1),
     last_at timestamptz not null default now(),
     beats bigint not null default 0
   );
   alter table public.heartbeat enable row level security;

   create or replace function public.keep_awake()
   returns timestamptz
   language sql
   security definer
   set search_path = public
   as $$
     insert into public.heartbeat as h (id, last_at, beats) values (1, now(), 1)
       on conflict (id) do update set last_at = now(), beats = h.beats + 1
     returning h.last_at;
   $$;
   revoke all on function public.keep_awake() from public;
   grant execute on function public.keep_awake() to anon;
   ```

3. **Copy the two values** from the project's API settings (the Connect
   button, or Project settings → API):
   - Project URL → `SUPABASE_URL`
   - `anon` `public` key → `SUPABASE_ANON_KEY`

4. **Give them to GitHub**: repo → Settings → Secrets and variables →
   Actions → **Variables** tab → add (or update) `SUPABASE_URL` and
   `SUPABASE_ANON_KEY`. Variables, not Secrets: the workflows read `vars.*`,
   and both values are public by design. Both workflows use them: the deploy
   builds them into the site, and the keep-awake pings with them. Re-run the
   deploy (Actions → Deploy to GitHub Pages → Run workflow) and the tally is
   back.

5. **Check the keep-awake once**: Actions → "Keep the launch counter awake" →
   Run workflow. Its log shows the count and the time it stamped. (It runs
   from the default branch, so it's there once this is merged.)

6. **Local dev** (optional): copy `.env.example` to `.env.local` and fill in
   the same two values as `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`.

## Staying awake

`.github/workflows/keep-counter-awake.yml` runs every day: it reads the count
and calls `keep_awake()`, a real write through the same public API the site
uses. Supabase judges whether a project had enough database activity over a
week (its guide says a few requests a day typically is enough), and GitHub can
run a schedule late or skip it when it's busy, so daily leaves plenty of room.

- If a run can't reach the project, it fails and GitHub emails you, before
  the tally goes dark.
- GitHub switches off a public repository's scheduled workflows after 60 days
  without activity in it. Each run switches its own schedule on again. If
  GitHub ever doesn't allow that, the run shows a warning instead (re-enable
  it under Actions → the workflow → Enable workflow).
- Without the two Variables the ping is skipped: nothing to keep awake.

## If the tally has gone dark

The project was most likely paused. Supabase dashboard → the project →
**Resume project**. A paused project can be resumed for up to a year (after
that it can no longer be restored from the dashboard). The count is kept.
Then run the SQL above once (it adds the heartbeat), and the keep-awake takes
it from there.

## Where it lives in the code

- `src/lib/launches.ts`: the whole client. One GET on page load
  (`useLaunchCount()`), one POST at liftoff (`recordLaunch()`), plain
  `fetch`, no SDK. Fails soft to "no tally shown".
- `src/scene/maquette/launchSite.tsx`: the invitation over the city, "flight
  simulator — fly the next launch", shows "0042 flights by visitors so far";
  `recordLaunch()` fires at liftoff (with reduced motion, as the countdown
  starts, since there's no film).
- `src/components/launch/LaunchOverlay.tsx`: the pad's panel says which
  flight yours would be ("flight 0043").
- `.github/workflows/deploy.yml`: passes the two Variables in as `VITE_*` at
  build time.
- `.github/workflows/keep-counter-awake.yml`: the daily keep-awake.

## Later

When the .NET CMS (docs/cms-plan.md) exists, this can move behind one tiny
`/api/launches` endpoint there and Supabase can be retired: the client
module is the only file that would change (and the keep-awake goes).

# The counters: a few public numbers in a free Supabase project

The site stays fully static; three numbers live in a free-tier Supabase
project:

- **launches**: the flights visitors have flown. Shown on the launch site's
  invitation ("0042 flights by visitors so far") and on the pad ("flight
  0043"); +1 at liftoff.
- **tickets**: the admission tickets handed out. Each visitor's own number is
  printed on their ticket ("Admit one · No. 0347", and on its stub); issued
  once per browser, on the first sign of a person (a pointer, a key, a wheel,
  a touch), and remembered.
- **all_ten**: the visitors who have seen all ten exhibits. Once a visitor
  has, the last stamp on the back of their ticket says which they were ("23rd
  visitor to see all ten"); counted once per browser and remembered, so
  starting the tour over doesn't count again.

With nothing configured, or the project unreachable, none of them shows: no
label, no errors, and the ticket reads "Admit one · exhibition guide" as it
always has. A browser driven by software (tests, the share-card renderer, a
crawler that says so) is never handed a ticket or counted as having seen all
ten. Nothing personal is sent or stored anywhere: each is a bare +1, and the
visitor's two numbers are remembered only in their own browser, like the
exhibits they've seen.

Supabase pauses a free project that shows too little database activity over
a week, and the numbers go dark with it. A daily GitHub Action keeps it awake
(see "Staying awake" below).

Threat model: none, deliberately. The anon key is public by design. The only
writes anyone can make are the three +1s and "stamp the heartbeat". Someone
bored could curl one in a loop and inflate a number. That's the accepted
trade for no backend of our own.

## Setup (~5 minutes)

1. **A project**: create one at [supabase.com](https://supabase.com) (free
   tier), or resume the old one (see "If the numbers have gone dark").

2. **Paste this into the SQL editor** (SQL editor → New query → Run). It's
   safe to run again on a project that already has the launch counter: it
   only adds what's missing (the two new counters, at 0, and the heartbeat),
   and the flights already counted stay.

   ```sql
   -- the counters: one row each
   --   launches  the flights visitors have flown
   --   tickets   the admission tickets handed out (the number on each)
   --   all_ten   the visitors who have seen all ten exhibits
   create table if not exists public.counters (
     name text primary key,
     value bigint not null default 0
   );
   insert into public.counters (name, value) values ('launches', 0), ('tickets', 0), ('all_ten', 0)
     on conflict (name) do nothing;

   -- anyone may read them; nobody may write to them directly
   alter table public.counters enable row level security;
   drop policy if exists "public read" on public.counters;
   create policy "public read" on public.counters for select using (true);

   -- the only ways to write to them: +1 each, nothing else, and the new value back
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

   create or replace function public.issue_ticket()
   returns bigint
   language sql
   security definer
   set search_path = public
   as $$
     update public.counters set value = value + 1 where name = 'tickets'
     returning value;
   $$;
   revoke all on function public.issue_ticket() from public;
   grant execute on function public.issue_ticket() to anon;

   create or replace function public.record_all_ten()
   returns bigint
   language sql
   security definer
   set search_path = public
   as $$
     update public.counters set value = value + 1 where name = 'all_ten'
     returning value;
   $$;
   revoke all on function public.record_all_ten() from public;
   grant execute on function public.record_all_ten() to anon;

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

   To start the ticket numbers somewhere other than 1, set the counter once
   (Table editor → counters → `tickets`).

3. **Copy the two values** from the project's API settings (the Connect
   button, or Project settings → API):
   - Project URL → `SUPABASE_URL`
   - `anon` `public` key → `SUPABASE_ANON_KEY`

4. **Give them to GitHub**: repo → Settings → Secrets and variables →
   Actions → **Variables** tab → add (or update) `SUPABASE_URL` and
   `SUPABASE_ANON_KEY`. Variables, not Secrets: the workflows read `vars.*`,
   and both values are public by design. Both workflows use them: the deploy
   builds them into the site, and the keep-awake pings with them. Re-run the
   deploy (Actions → Deploy to GitHub Pages → Run workflow) and the numbers
   are back.

5. **Check the keep-awake once**: Actions → "Keep the launch counter awake" →
   Run workflow. Its log shows the counters and the time it stamped. (It runs
   from the default branch, so it's there once this is merged.)

6. **Local dev** (optional): copy `.env.example` to `.env.local` and fill in
   the same two values as `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`.
   (Dev visits count like any other.)

## Staying awake

`.github/workflows/keep-counter-awake.yml` runs every day: it reads the
counters and calls `keep_awake()`, a real write through the same public API
the site uses. Supabase judges whether a project had enough database activity
over a week (its guide says a few requests a day typically is enough), and
GitHub can run a schedule late or skip it when it's busy, so daily leaves
plenty of room.

- If a run can't reach the project, it fails and GitHub emails you, before
  the numbers go dark.
- GitHub switches off a public repository's scheduled workflows after 60 days
  without activity in it. Each run switches its own schedule on again. If
  GitHub ever doesn't allow that, the run shows a warning instead (re-enable
  it under Actions → the workflow → Enable workflow).
- Without the two Variables the ping is skipped: nothing to keep awake.

## If the numbers have gone dark

The project was most likely paused. Supabase dashboard → the project →
**Resume project**. A paused project can be resumed for up to a year (after
that it can no longer be restored from the dashboard). The counts are kept.
Then run the SQL above once (it adds whatever's missing), and the keep-awake
takes it from there.

## Where it lives in the code

- `src/lib/counters.ts`: the shared client. Read a counter, call a +1, plain
  `fetch`, no SDK; fails soft to null.
- `src/lib/launches.ts`: the flights. One GET on page load
  (`useLaunchCount()`), one POST at liftoff (`recordLaunch()`).
- `src/lib/visit.ts`: the visitor's own two. `useTicketNo()` issues the
  ticket on the first sign of a person and remembers it (`mk-ticket`);
  `useAllTenNo()` counts the visitor once they've seen all ten
  (`mk-all-ten`).
- `src/components/hero/ExhibitionGuide.tsx`: the ticket. Its number in the
  top line and on both stubs; the all-ten stamp at the foot of the back,
  stamped in after the tenth "seen".
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

When the .NET CMS (docs/cms-plan.md) exists, this can move behind a tiny API
there and Supabase can be retired: `counters.ts` is the only file that would
change (and the keep-awake goes).

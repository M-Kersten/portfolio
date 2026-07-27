# The launch counter — global "how many visitors flew the rocket" odometer

A single number in a free-tier Supabase project. The site stays fully static;
the counter shows on the launch-site invitation and the pad panel, and ticks
+1 at ignition (when the countdown hits zero). With nothing configured the
feature is simply dark — no label, no requests, no errors.

Threat model: none, deliberately. The anon key is public by design and the
only write anyone can perform is "+1 launches" via the RPC. Someone bored
could curl it in a loop and inflate the number. That's the accepted trade
for zero backend of our own.

## Setup (~5 minutes)

1. **Create a project** at [supabase.com](https://supabase.com) (free tier).

2. **Paste this into the SQL editor** (Database → SQL editor → run):

   ```sql
   -- the one-row counter table
   create table if not exists public.counters (
     name text primary key,
     value bigint not null default 0
   );
   insert into public.counters (name, value) values ('launches', 0)
     on conflict (name) do nothing;

   -- lock the table down: anyone may read, nobody may write directly
   alter table public.counters enable row level security;
   create policy "public read" on public.counters for select using (true);

   -- the only write path: +1, nothing else
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
   ```

3. **Copy the two values** from Project settings → API:
   - Project URL → `SUPABASE_URL`
   - `anon` `public` key → `SUPABASE_ANON_KEY`

4. **Wire them into the deploy**: repo → Settings → Secrets and variables →
   Actions → **Variables** tab → add `SUPABASE_URL` and `SUPABASE_ANON_KEY`.
   (Variables, not Secrets — the workflow reads `vars.*`, and both values are
   public by design.) Re-run the deploy; done.

5. **Local dev** (optional): copy `.env.example` to `.env.local` and fill in
   the same two values as `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`.

## Where it lives in the code

- `src/lib/launches.ts` — the whole client: one GET on page load
  (`useLaunchCount()`), one POST at ignition (`recordLaunch()`), plain
  `fetch`, no SDK. Fails soft to "no tally shown".
- `src/scene/maquette/city.tsx` — the invitation label under
  "my next launch" shows `0042 launches by visitors so far`.
- `src/components/LaunchOverlay.tsx` — the pad panel eyebrow becomes
  `MK-01 · THE NEXT LAUNCH · FLIGHT 43`, with the tally line underneath;
  `recordLaunch()` fires when the count reaches zero (scrubs don't count).
- `.github/workflows/deploy.yml` — passes the two repo Variables in as
  `VITE_*` at build time.

## Later

When the .NET CMS (docs/cms-plan.md) exists, this can move behind one tiny
`/api/launches` endpoint there and Supabase can be retired — the client
module is the only file that would change.

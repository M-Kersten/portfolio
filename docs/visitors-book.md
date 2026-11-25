# The visitors' book: lines people leave on their way out

At the foot of the site, beside exhibit 11's plinth, is a visitors' book
(`src/components/home/Contact.tsx`): a line, a name if you like, and the lines
others left. It lives in the same free Supabase project as the counters
([counters.md](counters.md)), so there's nothing new to set up but one table.

**A line isn't public until you've read it.** It's stored waiting, and only
lines you've marked as shown can be read back by anyone. Whoever wrote it sees
their own line at once (from their own browser's memory), marked "waiting to
be read"; everyone else sees it once you show it.

What's stored for a line: the words, the name if one was given, the writer's
ticket number if they had one, and when. Nothing else: no address, no IP, no
browser.

With no Supabase project configured there is no book: the same line goes to
you as an email instead, and the section says so.

## Setup (2 minutes, once)

The project and its two GitHub Variables are already there for the counters.
The book only needs its table.

1. **Paste this into the SQL editor** (Supabase dashboard → SQL editor → New
   query → Run). It's safe to run again: it only adds what's missing, and
   lines already written stay.

   ```sql
   -- the visitors' book: one row a line
   --   line        what they wrote (3 to 140 characters, no links)
   --   name        how they signed it, if they did
   --   ticket      their admission ticket's number, if they had one
   --   shown       whether it's in the book for everyone yet (you decide)
   create table if not exists public.visitors_book (
     id bigint generated always as identity primary key,
     line text not null check (char_length(line) between 3 and 140),
     name text check (name is null or char_length(name) between 1 and 40),
     ticket bigint check (ticket is null or ticket > 0),
     written_at timestamptz not null default now(),
     shown boolean not null default false
   );
   create index if not exists visitors_book_shown on public.visitors_book (written_at desc) where shown;

   -- anyone may read the lines that are shown; nobody may read the rest, or write
   -- to the table directly
   alter table public.visitors_book enable row level security;
   drop policy if exists "public read shown" on public.visitors_book;
   create policy "public read shown" on public.visitors_book for select using (shown);
   grant select on public.visitors_book to anon;

   -- the only way to write in it: one line, tidied, checked, and waiting to be shown
   create or replace function public.sign_book(p_line text, p_name text default null, p_ticket bigint default null)
   returns bigint
   language plpgsql
   security definer
   set search_path = public
   as $$
   declare
     l text := btrim(regexp_replace(coalesce(p_line, ''), '\s+', ' ', 'g'));
     n text := nullif(btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g')), '');
     t bigint;
     new_id bigint;
   begin
     if char_length(l) < 3 or char_length(l) > 140 or char_length(n) > 40 then
       raise exception 'book_length';
     end if;
     if l ~* '(https?:|www\.)' or n ~* '(https?:|www\.)' then
       raise exception 'book_links';
     end if;
     -- not a flood: at most 20 lines an hour from everyone together, and at most
     -- 300 waiting to be read
     if (select count(*) from visitors_book where written_at > now() - interval '1 hour') >= 20
        or (select count(*) from visitors_book where not shown) >= 300 then
       raise exception 'book_busy';
     end if;
     -- a ticket number only counts if a ticket with that number was handed out
     select p_ticket into t
       where p_ticket > 0 and p_ticket <= (select value from counters where name = 'tickets');
     insert into visitors_book (line, name, ticket) values (l, n, t) returning id into new_id;
     return new_id;
   end;
   $$;
   revoke all on function public.sign_book(text, text, bigint) from public;
   grant execute on function public.sign_book(text, text, bigint) to anon;
   ```

2. That's it. The site finds the table by itself; nothing to redeploy for.

## Reading what's been written, and showing it

Supabase dashboard → **Table editor** → `visitors_book`. Sort by `written_at`
to see the newest.

- **Show a line**: tick its `shown` box. It's in the book for everyone from
  then on.
- **Don't show a line**: leave it, or delete the row. Its writer keeps seeing
  it as "waiting" in their own browser for three weeks, then it's forgotten.
- **Take a line out again**: untick `shown`, or delete the row.
- **Fix a typo**: edit `line` or `name` in place.

Or in the SQL editor:

```sql
-- what's waiting
select id, written_at, name, ticket, line from public.visitors_book where not shown order by written_at;

-- show one, or everything that's waiting
update public.visitors_book set shown = true where id = 12;
update public.visitors_book set shown = true where not shown;
```

Nothing tells you a line has come in: look when you think of it. (A daily
check that opens a GitHub issue when lines are waiting could be added to the
keep-awake workflow.)

### If you'd rather lines show straight away

```sql
alter table public.visitors_book alter column shown set default true;
```

From then on a new line is public the moment it's signed, and you take out
what you don't want afterwards. Back to reading first:

```sql
alter table public.visitors_book alter column shown set default false;
```

## What a visitor can and can't do

The anon key is public by design, as for the counters. With it, anyone can:

- read the lines marked as shown, and nothing else in the table;
- add a line through `sign_book()`, which tidies it and refuses what doesn't
  belong.

`sign_book()` refuses, and the site says why:

- a line under 3 or over 140 characters, or a name over 40;
- anything with a link in it (`http:`, `https:`, `www.`);
- a flood: more than 20 lines in an hour from everyone together, or more than
  300 lines waiting to be read. The book reads as "busy" until that eases.

A ticket number only counts if the counters have handed out a ticket with that
number; otherwise the line is signed without one.

Nobody can write to the table directly, edit a line, or read a line that
isn't shown. Someone bored could still fill the waiting list with nonsense up
to those limits. None of it shows unless you show it, and clearing it is one
query: `delete from public.visitors_book where not shown;`

## Where it lives in the code

- `src/lib/book.ts`: the client. `readBook()` (the shown lines, plus your own
  waiting ones), `signBook()`; plain `fetch`, no SDK, fails soft.
- `src/components/home/Contact.tsx`: the book itself, and what it says when a
  line is refused or the book won't open.
- `src/components/home/ContactMotif.tsx`: the plinth beside it. The line being
  written, or one that's pointed at, takes shape there.
- `src/lib/counters.ts`: the project's address and key (`project`), shared with
  the counters.

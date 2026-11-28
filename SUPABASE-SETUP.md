# NutriLog — Supabase setup

NutriLog uses the Supabase project **lifelog** (`jpsisvaprkrcyvwnmasb`), shared with Coin and WalkLog.
The app only ever uses the public anon key; every table must have Row Level Security on, with a policy
that limits each signed-in user to their own rows.

Run the sections below yourself in **Supabase Dashboard → SQL Editor**. Every section is safe to re-run.

## Tables

| Table | Key | Contents |
| --- | --- | --- |
| `nutrilog_sessions` | `user_id, profile_id, date` | one day's meals (`meals` jsonb) — the day being logged |
| `nutrilog_history` | `user_id, profile_id, date` | one day's meals (`meals` jsonb) — every day, including today |
| `nutrilog_settings` | `user_id, profile_id` | goals, targets, theme (`data` jsonb). `profile_id = 'shared'` holds the profile list once saved |
| `nutrilog_food_library` | `user_id, profile_id` | the food library (`data` jsonb array), always `profile_id = 'shared'` |
| `nutrilog_recipes` | `user_id, profile_id` | recipes (`data` jsonb) |
| `nutrilog_templates` | `user_id, profile_id` | meal templates (`data` jsonb) |
| `nutrilog_checkins` | `user_id, profile_id` | weekly check-ins (`data` jsonb) |

---

## 2026-11-21 — One row per entry and per food

Adds two tables. Nothing reads or writes them until the app update that switches over (phase B), and
the old tables above are not touched, so they stay as a full backup.

| Table | Key | Contents |
| --- | --- | --- |
| `nutrilog_entries` | `id` | one logged food: profile, date, time, meal, name, serving, macros. Any other fields (sugar, `_base`, …) go in `extra` |
| `nutrilog_foods` | `id` | one food library item, shared by all profiles. A name can exist only once (case and spaces ignored) |

Why: the old tables hold a whole day (or the whole library) as one value, so every save had to
re-read, merge and rewrite it, and two devices saving at once could undo each other. With one row per
item, adding, editing or deleting touches only that row.

**Step 1 — create the tables.** Safe to re-run.

```sql
create table if not exists public.nutrilog_entries (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  profile_id  text not null,
  date        date not null,
  time        text,
  cat         text,
  name        text not null,
  serving     numeric,
  unit        text,
  kcal        numeric not null default 0,
  protein     numeric not null default 0,
  fat         numeric not null default 0,
  carbs       numeric not null default 0,
  fiber       numeric not null default 0,
  notes       text not null default '',
  extra       jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists nutrilog_entries_day on public.nutrilog_entries (user_id, profile_id, date);

create table if not exists public.nutrilog_foods (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null,
  serving     numeric,
  unit        text,
  kcal        numeric not null default 0,
  protein     numeric not null default 0,
  fat         numeric not null default 0,
  carbs       numeric not null default 0,
  fiber       numeric not null default 0,
  type        text,
  uses        integer not null default 0,
  extra       jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index if not exists nutrilog_foods_name on public.nutrilog_foods (user_id, lower(btrim(name)));

-- updated_at follows every edit
create or replace function public.nutrilog_touch() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists nutrilog_touch on public.nutrilog_entries;
create trigger nutrilog_touch before update on public.nutrilog_entries for each row execute function public.nutrilog_touch();
drop trigger if exists nutrilog_touch on public.nutrilog_foods;
create trigger nutrilog_touch before update on public.nutrilog_foods for each row execute function public.nutrilog_touch();

-- own rows only, same policy as every other NutriLog table
alter table public.nutrilog_entries enable row level security;
alter table public.nutrilog_foods enable row level security;
drop policy if exists "own rows" on public.nutrilog_entries;
create policy "own rows" on public.nutrilog_entries for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "own rows" on public.nutrilog_foods;
create policy "own rows" on public.nutrilog_foods for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- live updates: a change on one device reaches the others without polling
do $$
declare t text;
begin
  foreach t in array array['nutrilog_entries', 'nutrilog_foods'] loop
    if not exists (select 1 from pg_publication_tables
                   where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
```

**Step 2 — check (read-only).** Expect two rows with `rowsecurity = true`, two `own rows` policies,
and both tables listed under realtime.

```sql
select tablename, rowsecurity from pg_tables
where schemaname = 'public' and tablename in ('nutrilog_entries', 'nutrilog_foods');

select tablename, policyname, qual from pg_policies
where schemaname = 'public' and tablename in ('nutrilog_entries', 'nutrilog_foods');

select tablename from pg_publication_tables
where pubname = 'supabase_realtime' and tablename in ('nutrilog_entries', 'nutrilog_foods');
```

**Step 3 — copy your data in.** From the project folder, in a terminal:

```
npm run migrate:rows            # dry run: reads everything, writes nothing, prints what it would copy
npm run migrate:rows -- --apply # saves a backup file first, then copies
```

The dry run lists any day where `nutrilog_sessions` and `nutrilog_history` disagree and which copy it
will use (today: sessions; any other day: history, which is what the desktop shows), and any foods
whose names differ only by upper/lower case (it keeps one and adds their use counts together). Send
Claude the dry-run output before running `--apply`.

`--apply` refuses to run if the new tables already hold rows for your account, so it can't copy
twice. To start the copy over, use `--apply --replace`, which empties only the two new tables first.

---

## 2026-10-10 — Check current RLS state (read-only)

Run this first and keep the output. It changes nothing.

```sql
select tablename, rowsecurity
from pg_tables
where schemaname = 'public' and tablename like 'nutrilog\_%'
order by tablename;

select tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public' and tablename like 'nutrilog\_%'
order by tablename, policyname;
```

What to look for: `rowsecurity` should be `true` on all 7 tables, and no policy should have a `qual`
that lets other users' rows through (for example `true`). Policies are OR-ed together, so one
permissive policy on a table is enough to open it up — the section below adds the correct policy but
does **not** remove any existing ones. If the check shows a policy you don't recognise, tell Claude
before dropping it.

## 2026-10-10 — RLS "own rows" on every NutriLog table

Turns RLS on and (re)creates one policy per table: a signed-in user can read and write only rows where
`user_id` is their own id. Re-runnable — the policy is dropped and recreated under the same name.

```sql
do $$
declare t text;
begin
  foreach t in array array[
    'nutrilog_sessions', 'nutrilog_history', 'nutrilog_settings', 'nutrilog_food_library',
    'nutrilog_recipes', 'nutrilog_templates', 'nutrilog_checkins'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "own rows" on public.%I', t);
    execute format(
      'create policy "own rows" on public.%I for all to authenticated
         using (auth.uid() = user_id) with check (auth.uid() = user_id)', t);
  end loop;
end $$;
```

Afterwards, re-run the check above: every table should show `rowsecurity = true` and an `own rows` policy.

If it stops with `operator does not exist: uuid = text`, a table's `user_id` column is text, not uuid.
The whole block runs as one transaction, so nothing will have changed — tell Claude and the policy will
be adjusted for that column type.

---

The SQL Editor runs as the database owner and bypasses RLS, so the data sections below name your
account's id explicitly (`aeb93db9-…`, from the 2026-10-10 backup). A full export taken before these
sections exists at `Tracker/nutrilog-backups/2026-10-10-04-11-37_cloud.json`.

## 2026-10-10 — Save the profile list

One row, `profile_id = 'shared'` in `nutrilog_settings`, holding the profiles every device shows in its
switcher. Re-runnable: it only (re)writes the `profiles` key and keeps anything else in that row. The
leftover ids `alex_1`, `alex_kim` and `me` are deliberately not listed (their rows are untouched).

```sql
insert into public.nutrilog_settings (user_id, profile_id, data, updated_at)
values (
  'aeb93db9-5b0c-4cd9-aefd-1b8a4cc31248', 'shared',
  '{"profiles":[{"id":"alex","name":"Alex Kim"},{"id":"mom","name":"Mom"},{"id":"dad","name":"Dad"},{"id":"aomsin","name":"Aomsin"}]}'::jsonb,
  now()
)
on conflict (user_id, profile_id) do update
  set data = coalesce(public.nutrilog_settings.data, '{}'::jsonb) || jsonb_build_object('profiles', excluded.data -> 'profiles'),
      updated_at = now();
```

## 2026-10-10 — Clean up Mom's copied data

**When to run:** after phase (d), once every PC that has the old desktop app (including the parents'
PC) has updated to the new one. Until then, an old desktop app with Mom's profile selected pushes its
stale local copy straight back — a date the cloud has nothing for is treated as "local wins". That is
how the copies arrived: all 264 of Mom's history rows were written in one batch on 2026-10-06 04:12 UTC.

What's copied (from the 2026-10-10 backup):

- `nutrilog_history`, Mom: 262 of 264 days are your days (212 identical, 50 matching an older version
  of your day). Mom's own days, kept: **2026-05-31** and **2026-06-01**.
- `nutrilog_sessions`, Mom, 2026-06-09: your breakfast (Whole Wheat Bread, Meiji, Cadbury).
- `nutrilog_settings`, Mom: her own goals (64, F, 162 cm, 1,874 kcal) — only `displayName` was copied ("Alex Kim").
- `nutrilog_templates` and `nutrilog_recipes`, Mom: all 12 entries are exact copies of yours (optional step 4).

**Step 1 — preview (read-only).** Expect `history_rows = 262`, `session_rows = 1`, `wrong_name = 1`.

```sql
select
  (select count(*) from public.nutrilog_history
    where user_id = 'aeb93db9-5b0c-4cd9-aefd-1b8a4cc31248' and profile_id = 'mom'
      and date <= '2026-10-05' and date not in ('2026-05-31', '2026-06-01')
      and updated_at < '2026-10-07') as history_rows,
  (select count(*) from public.nutrilog_sessions
    where user_id = 'aeb93db9-5b0c-4cd9-aefd-1b8a4cc31248' and profile_id = 'mom' and date = '2026-06-09'
      and meals @> '[{"name":"Meiji No Added Sugar (155 mL)","time":"08:27"}]'::jsonb) as session_rows,
  (select count(*) from public.nutrilog_settings
    where user_id = 'aeb93db9-5b0c-4cd9-aefd-1b8a4cc31248' and profile_id = 'mom'
      and data ->> 'displayName' = 'Alex Kim') as wrong_name;
```

**Steps 2–3 — remove the copies and fix the name.** One transaction. Re-runnable, and bounded so it can
never touch a day Mom logs after the copies were made (`updated_at < 2026-10-07`, `date <= 2026-10-05`).

```sql
begin;

delete from public.nutrilog_history
where user_id = 'aeb93db9-5b0c-4cd9-aefd-1b8a4cc31248' and profile_id = 'mom'
  and date <= '2026-10-05' and date not in ('2026-05-31', '2026-06-01')
  and updated_at < '2026-10-07';

delete from public.nutrilog_sessions
where user_id = 'aeb93db9-5b0c-4cd9-aefd-1b8a4cc31248' and profile_id = 'mom' and date = '2026-06-09'
  and meals @> '[{"name":"Meiji No Added Sugar (155 mL)","time":"08:27"}]'::jsonb;

update public.nutrilog_settings
set data = jsonb_set(data, '{displayName}', '"Mom"'), updated_at = now()
where user_id = 'aeb93db9-5b0c-4cd9-aefd-1b8a4cc31248' and profile_id = 'mom'
  and data ->> 'displayName' = 'Alex Kim';

commit;
```

**Step 4 (optional) — remove Mom's copied templates and recipes.** Only if Mom doesn't use your batch
recipes/templates on the parents' PC. Both rows are exact copies of yours as of the backup; the `where`
checks they still are, so this does nothing if Mom has since edited either.

```sql
delete from public.nutrilog_templates m
using public.nutrilog_templates a
where m.user_id = 'aeb93db9-5b0c-4cd9-aefd-1b8a4cc31248' and m.profile_id = 'mom'
  and a.user_id = m.user_id and a.profile_id = 'alex'
  and not exists (select 1 from jsonb_each(m.data) e where a.data -> e.key is distinct from e.value);

delete from public.nutrilog_recipes m
using public.nutrilog_recipes a
where m.user_id = 'aeb93db9-5b0c-4cd9-aefd-1b8a4cc31248' and m.profile_id = 'mom'
  and a.user_id = m.user_id and a.profile_id = 'alex'
  and not exists (select 1 from jsonb_each(m.data) e where a.data -> e.key is distinct from e.value);
```

---

## 2026-11-25 — Claude access (time-boxed editing, activity log)

Lets Claude log and fix entries and foods **through its own helper account**, never your login.
Same pattern as Coin (same Supabase project), so the helper account you made for Coin can be reused.
Settings → Claude access connects the helper for **one profile** and controls it:

- **Connected** — the helper can read that profile's entries and the food database. Nothing else
  (no settings, targets, templates, recipes, check-ins, other profiles).
- **Editing window** (1 hour / rest of today / 24 hours) — only then may it add, edit and delete
  those entries and foods. When the window ends the database itself refuses its writes.
- Every change the helper makes is logged automatically and listed in Settings with **Undo**.
- **Disconnect** removes all access immediately.

Paste only this block. Safe to re-run; nothing existing is changed or removed.

```sql
-- Who may act on whose NutriLog data, for which profile, until when.
create table if not exists public.nutrilog_delegates (
  owner_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  delegate_id    uuid not null references auth.users(id) on delete cascade,
  delegate_email text not null,
  profile_id     text not null,
  edit_until     timestamptz,   -- editing allowed until this moment; null/past = read only
  edit_note      text,
  created_at     timestamptz not null default now(),
  primary key (owner_id, delegate_id)
);
alter table public.nutrilog_delegates enable row level security;
drop policy if exists "owner manages" on public.nutrilog_delegates;
create policy "owner manages" on public.nutrilog_delegates for all to authenticated
  using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
drop policy if exists "delegate reads own grant" on public.nutrilog_delegates;
create policy "delegate reads own grant" on public.nutrilog_delegates for select to authenticated
  using (auth.uid() = delegate_id);

-- profile = null means "the food database" (shared by all profiles).
create or replace function public.nutrilog_can_read(owner uuid, profile text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from nutrilog_delegates where owner_id = owner and delegate_id = auth.uid()
    and (profile is null or profile_id = profile))
$$;
create or replace function public.nutrilog_can_edit(owner uuid, profile text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from nutrilog_delegates where owner_id = owner and delegate_id = auth.uid()
    and (profile is null or profile_id = profile) and edit_until > now())
$$;

-- Connect a helper account by email (it must already be signed up).
create or replace function public.nutrilog_add_delegate(helper_email text, profile text) returns uuid
language plpgsql security definer set search_path = public as $$
declare d uuid;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  select id into d from auth.users where lower(email) = lower(trim(helper_email));
  if d is null then raise exception 'No account with that email — create it first'; end if;
  if d = auth.uid() then raise exception 'That is your own account — use a separate one for Claude'; end if;
  insert into nutrilog_delegates (owner_id, delegate_id, delegate_email, profile_id)
    values (auth.uid(), d, lower(trim(helper_email)), profile)
    on conflict (owner_id, delegate_id) do update set profile_id = excluded.profile_id;
  return d;
end $$;
revoke all on function public.nutrilog_add_delegate(text, text) from public, anon;
grant execute on function public.nutrilog_add_delegate(text, text) to authenticated;

-- Entries: that profile only. Foods: the whole food database. Read while
-- connected; write only inside the window. (Your own "own rows" policy is unchanged.)
drop policy if exists "delegate read" on public.nutrilog_entries;
create policy "delegate read" on public.nutrilog_entries for select to authenticated
  using (nutrilog_can_read(user_id, profile_id));
drop policy if exists "delegate insert" on public.nutrilog_entries;
create policy "delegate insert" on public.nutrilog_entries for insert to authenticated
  with check (nutrilog_can_edit(user_id, profile_id));
drop policy if exists "delegate update" on public.nutrilog_entries;
create policy "delegate update" on public.nutrilog_entries for update to authenticated
  using (nutrilog_can_edit(user_id, profile_id)) with check (nutrilog_can_edit(user_id, profile_id));
drop policy if exists "delegate delete" on public.nutrilog_entries;
create policy "delegate delete" on public.nutrilog_entries for delete to authenticated
  using (nutrilog_can_edit(user_id, profile_id));

drop policy if exists "delegate read" on public.nutrilog_foods;
create policy "delegate read" on public.nutrilog_foods for select to authenticated
  using (nutrilog_can_read(user_id, null));
drop policy if exists "delegate insert" on public.nutrilog_foods;
create policy "delegate insert" on public.nutrilog_foods for insert to authenticated
  with check (nutrilog_can_edit(user_id, null));
drop policy if exists "delegate update" on public.nutrilog_foods;
create policy "delegate update" on public.nutrilog_foods for update to authenticated
  using (nutrilog_can_edit(user_id, null)) with check (nutrilog_can_edit(user_id, null));
drop policy if exists "delegate delete" on public.nutrilog_foods;
create policy "delegate delete" on public.nutrilog_foods for delete to authenticated
  using (nutrilog_can_edit(user_id, null));

-- Every change a helper makes is logged, so it can be reviewed and undone.
-- Helpers can't read or alter the log.
create table if not exists public.nutrilog_delegate_log (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references auth.users(id) on delete cascade,
  actor_id   uuid not null,
  tbl        text not null,  -- nutrilog_entries | nutrilog_foods
  action     text not null,  -- insert | update | delete
  row_id     uuid not null,
  before     jsonb,
  after      jsonb,
  undone_at  timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists nutrilog_delegate_log_owner on public.nutrilog_delegate_log (owner_id, created_at desc);
alter table public.nutrilog_delegate_log enable row level security;
drop policy if exists "owner reads" on public.nutrilog_delegate_log;
create policy "owner reads" on public.nutrilog_delegate_log for select to authenticated
  using (auth.uid() = owner_id);
drop policy if exists "owner marks undone" on public.nutrilog_delegate_log;
create policy "owner marks undone" on public.nutrilog_delegate_log for update to authenticated
  using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

create or replace function public.nutrilog_log_delegate_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare owner uuid := coalesce(new.user_id, old.user_id);
begin
  if auth.uid() is null or auth.uid() = owner then return null; end if;
  insert into nutrilog_delegate_log (owner_id, actor_id, tbl, action, row_id, before, after)
  values (owner, auth.uid(), tg_table_name, lower(tg_op), coalesce(new.id, old.id),
    case when tg_op <> 'INSERT' then to_jsonb(old) end,
    case when tg_op <> 'DELETE' then to_jsonb(new) end);
  return null;
end $$;
drop trigger if exists nutrilog_delegate_log on public.nutrilog_entries;
create trigger nutrilog_delegate_log after insert or update or delete on public.nutrilog_entries
  for each row execute function public.nutrilog_log_delegate_change();
drop trigger if exists nutrilog_delegate_log on public.nutrilog_foods;
create trigger nutrilog_delegate_log after insert or update or delete on public.nutrilog_foods
  for each row execute function public.nutrilog_log_delegate_change();
```

**Check (read-only).** Expect `delegate delete / insert / read / update` plus `own rows` on each
table, and the trigger listed twice.

```sql
select tablename, policyname from pg_policies
where schemaname = 'public' and tablename in ('nutrilog_entries', 'nutrilog_foods') order by 1, 2;
select tgname, tgrelid::regclass from pg_trigger where tgname = 'nutrilog_delegate_log';
```

**After the SQL:** in NutriLog, Settings → Claude access → enter the helper account's email (the Coin
helper works). Then on your PC run `node scripts/save-session.mjs` **yourself** and sign in as the
helper — the script refuses your main account. Claude then works through `scripts/nutrilog-claude.mjs`.

## 2026-11-28 — Photo inbox (v2.19.0)

Quick food photos from the phone, kept **7 days** so Claude can estimate and log them later.
Files go to a **private** Storage bucket `nutrilog-photos` (`<your user id>/<uuid>.jpg`, ~300 KB each,
GPS stripped on the phone); one row each in `nutrilog_photos`.

Claude's helper (Settings → Claude access, same profile):
- **Connected** — may see that profile's photos that are not expired and not dismissed (row + file).
- **Editing window** — may also set a photo's `status` (pending/logged) and `entry_ids`. Nothing else;
  it can't add, delete, re-time or re-note photos.
- Expired photos are invisible to the helper at once; the app deletes them (file + row) on open.

Paste only this block. Safe to re-run. Needs the 2026-11-25 Claude access block first.

```sql
create table if not exists public.nutrilog_photos (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  profile_id  text not null,
  taken_at    timestamptz not null,
  time_source text not null check (time_source in ('exif', 'file', 'upload', 'manual')),
  note        text,
  path        text not null unique,
  status      text not null default 'pending' check (status in ('pending', 'logged', 'dismissed')),
  entry_ids   uuid[] not null default '{}',
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default now() + interval '7 days'
);
create index if not exists nutrilog_photos_profile on public.nutrilog_photos (user_id, profile_id, taken_at desc);
alter table public.nutrilog_photos enable row level security;

drop policy if exists "own rows" on public.nutrilog_photos;
create policy "own rows" on public.nutrilog_photos for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "delegate read" on public.nutrilog_photos;
create policy "delegate read" on public.nutrilog_photos for select to authenticated
  using (expires_at > now() and status <> 'dismissed' and nutrilog_can_read(user_id, profile_id));
drop policy if exists "delegate update" on public.nutrilog_photos;
create policy "delegate update" on public.nutrilog_photos for update to authenticated
  using (expires_at > now() and status <> 'dismissed' and nutrilog_can_edit(user_id, profile_id))
  with check (nutrilog_can_edit(user_id, profile_id));

-- A helper may only change status (pending/logged) and entry_ids.
create or replace function public.nutrilog_photos_guard() returns trigger
language plpgsql as $$
begin
  if auth.uid() is distinct from old.user_id then
    if (new.id, new.user_id, new.profile_id, new.taken_at, new.time_source, new.note, new.path, new.created_at, new.expires_at)
       is distinct from (old.id, old.user_id, old.profile_id, old.taken_at, old.time_source, old.note, old.path, old.created_at, old.expires_at) then
      raise exception 'Only status and entry_ids can be changed';
    end if;
    if new.status not in ('pending', 'logged') then raise exception 'Status must be pending or logged'; end if;
  end if;
  return new;
end $$;
drop trigger if exists nutrilog_photos_guard on public.nutrilog_photos;
create trigger nutrilog_photos_guard before update on public.nutrilog_photos
  for each row execute function public.nutrilog_photos_guard();

-- Live updates on the phone (e.g. Claude marking a photo logged).
do $$ begin
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'nutrilog_photos') then
    alter publication supabase_realtime add table public.nutrilog_photos;
  end if;
end $$;

-- Private bucket: JPEG only, max 2 MB per file.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('nutrilog-photos', 'nutrilog-photos', false, 2097152, array['image/jpeg'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Files: you manage your own folder; the helper may only download files whose
-- photo row it can see (same rules as the table above).
drop policy if exists "nutrilog photos own" on storage.objects;
create policy "nutrilog photos own" on storage.objects for all to authenticated
  using (bucket_id = 'nutrilog-photos' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'nutrilog-photos' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "nutrilog photos delegate read" on storage.objects;
create policy "nutrilog photos delegate read" on storage.objects for select to authenticated
  using (bucket_id = 'nutrilog-photos' and exists (
    select 1 from public.nutrilog_photos p
    where p.path = storage.objects.name and p.expires_at > now() and p.status <> 'dismissed'
      and public.nutrilog_can_read(p.user_id, p.profile_id)));
```

If the `storage.objects` policies fail with "must be owner of table objects", create the two
policies in Dashboard → Storage → Policies instead (same conditions).

**Check (read-only).** Expect `delegate read`, `delegate update`, `own rows`; the bucket with
`public = false`; and both storage policies.

```sql
select policyname from pg_policies where schemaname = 'public' and tablename = 'nutrilog_photos' order by 1;
select id, public, file_size_limit from storage.buckets where id = 'nutrilog-photos';
select policyname from pg_policies where schemaname = 'storage' and policyname like 'nutrilog photos%';
```

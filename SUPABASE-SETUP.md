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

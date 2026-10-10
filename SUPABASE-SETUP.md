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

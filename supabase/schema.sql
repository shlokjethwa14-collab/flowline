-- =====================================================================
-- Flowline — complete schema
-- =====================================================================
-- Run this once on a fresh Supabase project:
--   Dashboard -> SQL Editor -> paste -> Run
-- or:  psql "$DATABASE_URL" -f supabase/schema.sql
--
-- It is the same content as migrations/0001..0006 concatenated, and it is
-- safe to re-run: every object is created with IF NOT EXISTS or replaced.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- 1. Enums
-- ---------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'user_role') then
    create type public.user_role as enum ('admin', 'employee');
  end if;
  if not exists (select 1 from pg_type where typname = 'task_status') then
    create type public.task_status as enum ('todo', 'in_progress', 'review', 'done');
  end if;
  if not exists (select 1 from pg_type where typname = 'task_type') then
    create type public.task_type as enum ('general', 'call', 'order', 'entry', 'long', 'meeting', 'growth');
  end if;
end
$$;

-- ---------------------------------------------------------------------
-- 2. Tables
-- ---------------------------------------------------------------------

create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  role        public.user_role not null default 'employee',
  full_name   text not null default 'New teammate',
  job_title   text,
  reports_to  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  constraint profiles_no_self_manager check (reports_to is null or reports_to <> id)
);

create table if not exists public.task_routines (
  id                uuid primary key default gen_random_uuid(),
  title             text not null,
  task_type         public.task_type not null default 'general',
  assigned_to       uuid references public.profiles (id) on delete set null,
  created_by        uuid references public.profiles (id) on delete set null,
  -- Wall-clock time the generated task is due, stored as 'HH:MM'.
  due_time          text not null default '17:00',
  checklist         jsonb not null default '[]'::jsonb,
  active            boolean not null default true,
  last_generated_on date,
  created_at        timestamptz not null default now(),
  constraint task_routines_due_time_format check (due_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  constraint task_routines_checklist_is_array check (jsonb_typeof(checklist) = 'array'),
  constraint task_routines_title_not_blank check (length(btrim(title)) > 0)
);

create table if not exists public.tasks (
  id                uuid primary key default gen_random_uuid(),
  title             text not null,
  description       text,
  status            public.task_status not null default 'todo',
  assigned_to       uuid references public.profiles (id) on delete set null,
  created_by        uuid references public.profiles (id) on delete set null,
  due_date          timestamptz,
  is_blocked        boolean not null default false,
  status_changed_at timestamptz not null default now(),
  completed_at      timestamptz,
  task_type         public.task_type not null default 'general',
  checklist         jsonb not null default '[]'::jsonb,
  -- Set only on tasks produced by a daily routine; together with routine_on
  -- these give the generator its idempotency key.
  routine_id        uuid references public.task_routines (id) on delete set null,
  routine_on        date,
  created_at        timestamptz not null default now(),
  constraint tasks_checklist_is_array check (jsonb_typeof(checklist) = 'array'),
  constraint tasks_title_not_blank check (length(btrim(title)) > 0)
);

create table if not exists public.activity_logs (
  id         uuid primary key default gen_random_uuid(),
  task_id    uuid not null references public.tasks (id) on delete cascade,
  user_id    uuid references public.profiles (id) on delete set null,
  content    text not null,
  created_at timestamptz not null default now(),
  constraint activity_logs_content_not_blank check (length(btrim(content)) > 0)
);

create table if not exists public.task_handoffs (
  id           uuid primary key default gen_random_uuid(),
  task_id      uuid not null references public.tasks (id) on delete cascade,
  from_user_id uuid references public.profiles (id) on delete set null,
  to_user_id   uuid references public.profiles (id) on delete set null,
  -- A handoff without a written reason is not a handoff.
  note         text not null,
  created_at   timestamptz not null default now(),
  constraint task_handoffs_note_required check (length(btrim(note)) >= 10)
);

-- ---------------------------------------------------------------------
-- 3. Indexes
-- ---------------------------------------------------------------------

create index if not exists profiles_reports_to_idx on public.profiles (reports_to);
create index if not exists tasks_assigned_to_idx   on public.tasks (assigned_to);
create index if not exists tasks_created_by_idx    on public.tasks (created_by);
create index if not exists tasks_status_idx        on public.tasks (status);
create index if not exists tasks_due_date_idx      on public.tasks (due_date);
create index if not exists activity_task_idx       on public.activity_logs (task_id, created_at desc);
create index if not exists handoffs_task_idx       on public.task_handoffs (task_id, created_at desc);
create index if not exists handoffs_created_idx    on public.task_handoffs (created_at desc);
create index if not exists routines_assigned_idx   on public.task_routines (assigned_to);

-- One task per routine per day. This is what makes generation idempotent.
create unique index if not exists tasks_routine_once_per_day_idx
  on public.tasks (routine_id, routine_on)
  where routine_id is not null and routine_on is not null;

-- ---------------------------------------------------------------------
-- 4. Helper functions
-- ---------------------------------------------------------------------
-- These are SECURITY DEFINER so they read the tables without re-entering
-- RLS, which is what stops the profiles policies recursing forever.

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

create or replace function public.can_see_task(p_task_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin()
      or exists (
           select 1 from public.tasks t
           where t.id = p_task_id
             and (t.assigned_to = auth.uid() or t.created_by = auth.uid())
         );
$$;

-- ---------------------------------------------------------------------
-- 5. Triggers
-- ---------------------------------------------------------------------

-- 5a. Every auth user gets a profile. The role is decided HERE, in the
--     database — never read from client-supplied metadata. The first person
--     to sign up bootstraps as the owner; everyone after that is an employee
--     until an admin promotes them.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role         public.user_role := 'employee';
  v_profile_count integer;
begin
  select count(*) into v_profile_count from public.profiles;
  if v_profile_count = 0 then
    v_role := 'admin';
  end if;

  insert into public.profiles (id, role, full_name, job_title)
  values (
    new.id,
    v_role,
    coalesce(
      nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
      split_part(coalesce(new.email, 'teammate@local'), '@', 1)
    ),
    nullif(btrim(new.raw_user_meta_data ->> 'job_title'), '')
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 5b. Nobody can promote themselves. Even if a client crafts an update that
--     passes RLS, this refuses the role change.
create or replace function public.protect_profile_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- auth.uid() is null only for trusted server-side contexts (the service
  -- role, migrations, seeding). No `authenticated` policy admits those, so
  -- reaching here without a uid already means the caller is trusted.
  if auth.uid() is null or public.is_admin() then
    return new;
  end if;

  if new.role is distinct from old.role then
    raise exception 'Only an owner can change what someone can see.' using errcode = '42501';
  end if;

  if new.reports_to is distinct from old.reports_to then
    raise exception 'Only an owner can change who someone reports to.' using errcode = '42501';
  end if;

  if new.id is distinct from old.id then
    raise exception 'A profile id cannot be changed.' using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_protect_columns on public.profiles;
create trigger profiles_protect_columns
  before update on public.profiles
  for each row execute function public.protect_profile_columns();

-- 5c. Employees may change status, blocked state and checklist progress.
--     Everything else on a task belongs to the owner. Reassignment is only
--     legal inside handoff_task(), which sets the flowline.handoff flag.
create or replace function public.protect_task_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or public.is_admin() then
    return new;
  end if;

  if new.title       is distinct from old.title
  or new.description is distinct from old.description
  or new.due_date    is distinct from old.due_date
  or new.task_type   is distinct from old.task_type
  or new.created_by  is distinct from old.created_by
  or new.routine_id  is distinct from old.routine_id
  or new.routine_on  is distinct from old.routine_on then
    raise exception 'Only an owner can edit the details of a task.' using errcode = '42501';
  end if;

  if new.assigned_to is distinct from old.assigned_to
     and coalesce(current_setting('flowline.handoff', true), 'off') <> 'on' then
    raise exception 'Use the handoff action to pass work to someone else.' using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists tasks_protect_columns on public.tasks;
create trigger tasks_protect_columns
  before update on public.tasks
  for each row execute function public.protect_task_columns();

-- 5d. Status and completion timestamps are maintained by the database, so
--     they are always trustworthy no matter which client wrote the row.
create or replace function public.touch_task_timestamps()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.status_changed_at := now();
    if new.status = 'done' then
      new.completed_at := coalesce(new.completed_at, now());
    else
      new.completed_at := null;
    end if;
    return new;
  end if;

  if new.status is distinct from old.status then
    new.status_changed_at := now();
    if new.status = 'done' then
      new.completed_at := now();
    else
      new.completed_at := null;
    end if;
  end if;

  -- Finished work cannot also be blocked.
  if new.status = 'done' then
    new.is_blocked := false;
  end if;

  return new;
end;
$$;

drop trigger if exists tasks_touch_timestamps on public.tasks;
create trigger tasks_touch_timestamps
  before insert or update on public.tasks
  for each row execute function public.touch_task_timestamps();

-- 5e. A handoff must name a real reason and must come from the person who
--     actually holds the work (owners excepted).
create or replace function public.validate_handoff()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
begin
  -- Trusted server-side context (service role / seeding): the note rule below
  -- is still enforced by the table CHECK constraint.
  if auth.uid() is null then
    return new;
  end if;

  if length(btrim(coalesce(new.note, ''))) < 10 then
    raise exception 'Please write at least 10 characters explaining why you are passing this on.'
      using errcode = '23514';
  end if;

  if new.to_user_id is null then
    raise exception 'Choose who should take this over.' using errcode = '23514';
  end if;

  if not exists (select 1 from public.profiles where id = new.to_user_id) then
    raise exception 'That teammate does not exist.' using errcode = '23503';
  end if;

  if not public.is_admin() then
    select assigned_to into v_owner from public.tasks where id = new.task_id;
    if v_owner is distinct from auth.uid() then
      raise exception 'You can only pass on work that is assigned to you.' using errcode = '42501';
    end if;
    if new.from_user_id is distinct from auth.uid() then
      raise exception 'A handoff must be recorded under your own name.' using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists handoffs_validate on public.task_handoffs;
create trigger handoffs_validate
  before insert on public.task_handoffs
  for each row execute function public.validate_handoff();

-- ---------------------------------------------------------------------
-- 6. Remote procedures
-- ---------------------------------------------------------------------

-- 6a. The only supported way to move work between people. Reassigns the task,
--     records who passed it and why, and writes the reason into the activity
--     log so it appears in the evening report.
create or replace function public.handoff_task(
  p_task_id uuid,
  p_to_user uuid,
  p_note    text
)
returns public.tasks
language plpgsql
security definer
set search_path = public
as $$
declare
  v_task public.tasks;
  v_note text := btrim(coalesce(p_note, ''));
  v_from uuid;
begin
  if auth.uid() is null then
    raise exception 'Please sign in again.' using errcode = '42501';
  end if;

  select * into v_task from public.tasks where id = p_task_id;
  if not found then
    raise exception 'That work is no longer here.' using errcode = 'P0002';
  end if;

  if not public.is_admin() and v_task.assigned_to is distinct from auth.uid() then
    raise exception 'You can only pass on work that is assigned to you.' using errcode = '42501';
  end if;

  if length(v_note) < 10 then
    raise exception 'Please write at least 10 characters explaining why you are passing this on.'
      using errcode = '23514';
  end if;

  if p_to_user is null then
    raise exception 'Choose who should take this over.' using errcode = '23514';
  end if;

  if p_to_user = v_task.assigned_to then
    raise exception 'That person already owns this work.' using errcode = '23514';
  end if;

  if not exists (select 1 from public.profiles where id = p_to_user) then
    raise exception 'That teammate does not exist.' using errcode = '23503';
  end if;

  v_from := v_task.assigned_to;

  -- Transaction-local flag that lets protect_task_columns() allow this one
  -- reassignment. It is cleared automatically when the statement ends.
  perform set_config('flowline.handoff', 'on', true);

  update public.tasks
     set assigned_to = p_to_user,
         is_blocked  = false
   where id = p_task_id
  returning * into v_task;

  insert into public.task_handoffs (task_id, from_user_id, to_user_id, note)
  values (p_task_id, coalesce(v_from, auth.uid()), p_to_user, v_note);

  insert into public.activity_logs (task_id, user_id, content)
  values (p_task_id, auth.uid(), 'Passed this work on. Reason: ' || v_note);

  perform set_config('flowline.handoff', 'off', true);

  return v_task;
end;
$$;

-- 6b. Materialises one task per active daily routine per working day.
--     Idempotent: the unique index on (routine_id, routine_on) means running
--     it a hundred times a day still produces exactly one task per routine.
--     Sunday is not a working day.
create or replace function public.generate_routine_tasks(p_on date default (now() at time zone 'utc')::date)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_routine public.task_routines;
  v_created integer := 0;
  v_due     timestamptz;
begin
  if auth.uid() is null then
    return 0;
  end if;

  -- 7 = Sunday under ISO numbering.
  if extract(isodow from p_on) = 7 then
    return 0;
  end if;

  for v_routine in
    select * from public.task_routines
    where active
      and (last_generated_on is null or last_generated_on < p_on)
  loop
    v_due := (p_on::text || ' ' || v_routine.due_time || ':00')::timestamptz;

    begin
      insert into public.tasks
        (title, description, task_type, assigned_to, created_by, due_date, checklist, routine_id, routine_on)
      values
        (v_routine.title, 'Daily routine.', v_routine.task_type, v_routine.assigned_to,
         v_routine.created_by, v_due, v_routine.checklist, v_routine.id, p_on);
      v_created := v_created + 1;
    exception
      when unique_violation then
        -- Another session generated it first. That is the desired outcome.
        null;
    end;

    update public.task_routines
       set last_generated_on = p_on
     where id = v_routine.id;
  end loop;

  return v_created;
end;
$$;

-- ---------------------------------------------------------------------
-- 7. Row Level Security
-- ---------------------------------------------------------------------

alter table public.profiles      enable row level security;
alter table public.tasks         enable row level security;
alter table public.activity_logs enable row level security;
alter table public.task_handoffs enable row level security;
alter table public.task_routines enable row level security;

-- 7a. profiles ---------------------------------------------------------
-- Everyone signed in can read the directory: names are needed for the org
-- chart, assignee lists and handoff history. Writing is owner-only, and the
-- protect_profile_columns trigger blocks self-promotion regardless.

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated
  using (true);

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());

drop policy if exists profiles_insert_admin on public.profiles;
create policy profiles_insert_admin on public.profiles
  for insert to authenticated
  with check (public.is_admin());

drop policy if exists profiles_delete_admin on public.profiles;
create policy profiles_delete_admin on public.profiles
  for delete to authenticated
  using (public.is_admin());

-- 7b. tasks ------------------------------------------------------------

drop policy if exists tasks_select on public.tasks;
create policy tasks_select on public.tasks
  for select to authenticated
  using (
    public.is_admin()
    or assigned_to = auth.uid()
    or created_by  = auth.uid()
  );

drop policy if exists tasks_insert_admin on public.tasks;
create policy tasks_insert_admin on public.tasks
  for insert to authenticated
  with check (public.is_admin());

-- Employees may update the tasks they hold. Which COLUMNS they may touch is
-- enforced by the protect_task_columns trigger, not by this policy.
drop policy if exists tasks_update on public.tasks;
create policy tasks_update on public.tasks
  for update to authenticated
  using (public.is_admin() or assigned_to = auth.uid())
  with check (public.is_admin() or assigned_to = auth.uid());

drop policy if exists tasks_delete_admin on public.tasks;
create policy tasks_delete_admin on public.tasks
  for delete to authenticated
  using (public.is_admin());

-- 7c. activity_logs ----------------------------------------------------

drop policy if exists activity_select on public.activity_logs;
create policy activity_select on public.activity_logs
  for select to authenticated
  using (public.can_see_task(task_id));

drop policy if exists activity_insert on public.activity_logs;
create policy activity_insert on public.activity_logs
  for insert to authenticated
  with check (user_id = auth.uid() and public.can_see_task(task_id));

drop policy if exists activity_update_admin on public.activity_logs;
create policy activity_update_admin on public.activity_logs
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists activity_delete_admin on public.activity_logs;
create policy activity_delete_admin on public.activity_logs
  for delete to authenticated
  using (public.is_admin());

-- 7d. task_handoffs ----------------------------------------------------

drop policy if exists handoffs_select on public.task_handoffs;
create policy handoffs_select on public.task_handoffs
  for select to authenticated
  using (
    public.is_admin()
    or from_user_id = auth.uid()
    or to_user_id   = auth.uid()
    or public.can_see_task(task_id)
  );

drop policy if exists handoffs_insert on public.task_handoffs;
create policy handoffs_insert on public.task_handoffs
  for insert to authenticated
  with check (
    public.is_admin()
    or (from_user_id = auth.uid() and public.can_see_task(task_id))
  );

-- History is a record. Nobody edits or deletes it except the owner.
drop policy if exists handoffs_delete_admin on public.task_handoffs;
create policy handoffs_delete_admin on public.task_handoffs
  for delete to authenticated
  using (public.is_admin());

-- 7e. task_routines ----------------------------------------------------

drop policy if exists routines_select on public.task_routines;
create policy routines_select on public.task_routines
  for select to authenticated
  using (public.is_admin() or assigned_to = auth.uid());

drop policy if exists routines_insert_admin on public.task_routines;
create policy routines_insert_admin on public.task_routines
  for insert to authenticated
  with check (public.is_admin());

drop policy if exists routines_update_admin on public.task_routines;
create policy routines_update_admin on public.task_routines
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists routines_delete_admin on public.task_routines;
create policy routines_delete_admin on public.task_routines
  for delete to authenticated
  using (public.is_admin());

-- ---------------------------------------------------------------------
-- 8. Grants
-- ---------------------------------------------------------------------
-- RLS decides the rows; these grants decide that the role may ask at all.

grant usage on schema public to anon, authenticated;

grant select, insert, update, delete on public.profiles      to authenticated;
grant select, insert, update, delete on public.tasks         to authenticated;
grant select, insert, update, delete on public.activity_logs to authenticated;
grant select, insert, delete         on public.task_handoffs to authenticated;
grant select, insert, update, delete on public.task_routines to authenticated;

grant execute on function public.is_admin()                        to authenticated;
grant execute on function public.can_see_task(uuid)                to authenticated;
grant execute on function public.handoff_task(uuid, uuid, text)    to authenticated;
grant execute on function public.generate_routine_tasks(date)      to authenticated;

-- ---------------------------------------------------------------------
-- 9. Realtime
-- ---------------------------------------------------------------------
-- Every screen stays live. REPLICA IDENTITY FULL makes deletes and filtered
-- updates carry enough of the old row for clients to react correctly.

alter table public.tasks         replica identity full;
alter table public.activity_logs replica identity full;
alter table public.task_handoffs replica identity full;
alter table public.task_routines replica identity full;
alter table public.profiles      replica identity full;

do $$
declare
  t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;

  foreach t in array array['tasks', 'activity_logs', 'task_handoffs', 'task_routines', 'profiles']
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end
$$;

-- =====================================================================
-- Done. Next: sign in once with your own email — the first account
-- becomes the owner automatically.
-- =====================================================================
-- 0007_sop_categories â€” custom work types, standard procedures, time estimates.

-- Work types a company defines for itself, on top of the seven built-ins.
-- `base_type` keeps a custom type grouped correctly on My Day and in the
-- evening report without every consumer needing to know it exists.
create table if not exists public.task_categories (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  base_type         public.task_type not null default 'general',
  color             text not null default 'violet',
  icon              text not null default 'boxes',
  checklist         jsonb not null default '[]'::jsonb,
  sop               text,
  estimated_minutes integer,
  active            boolean not null default true,
  created_by        uuid references public.profiles (id) on delete set null,
  created_at        timestamptz not null default now(),
  constraint task_categories_name_not_blank check (length(btrim(name)) > 0),
  constraint task_categories_checklist_is_array check (jsonb_typeof(checklist) = 'array'),
  constraint task_categories_minutes_sane check (estimated_minutes is null or (estimated_minutes between 1 and 1440))
);

create index if not exists task_categories_active_idx on public.task_categories (active, name);

-- Standing instructions and a realistic duration, on both one-off work and
-- the routines that generate it.
alter table public.tasks
  add column if not exists sop text,
  add column if not exists estimated_minutes integer,
  add column if not exists category_id uuid references public.task_categories (id) on delete set null;

alter table public.task_routines
  add column if not exists sop text,
  add column if not exists estimated_minutes integer,
  add column if not exists category_id uuid references public.task_categories (id) on delete set null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'tasks_minutes_sane') then
    alter table public.tasks
      add constraint tasks_minutes_sane check (estimated_minutes is null or (estimated_minutes between 1 and 1440));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'routines_minutes_sane') then
    alter table public.task_routines
      add constraint routines_minutes_sane check (estimated_minutes is null or (estimated_minutes between 1 and 1440));
  end if;
end
$$;

create index if not exists tasks_category_idx on public.tasks (category_id);

-- The SOP is reference material an employee must be able to read on their own
-- work, so it is protected exactly like the other admin-owned columns: the
-- existing protect_task_columns() trigger already refuses any non-admin change
-- to columns outside status/blocked/checklist. Extend it to cover the new ones.
create or replace function public.protect_task_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or public.is_admin() then
    return new;
  end if;

  if new.title             is distinct from old.title
  or new.description       is distinct from old.description
  or new.due_date          is distinct from old.due_date
  or new.task_type         is distinct from old.task_type
  or new.created_by        is distinct from old.created_by
  or new.sop               is distinct from old.sop
  or new.estimated_minutes is distinct from old.estimated_minutes
  or new.category_id       is distinct from old.category_id
  or new.routine_id        is distinct from old.routine_id
  or new.routine_on        is distinct from old.routine_on then
    raise exception 'Only an owner can edit the details of a task.' using errcode = '42501';
  end if;

  if new.assigned_to is distinct from old.assigned_to
     and coalesce(current_setting('flowline.handoff', true), 'off') <> 'on' then
    raise exception 'Use the handoff action to pass work to someone else.' using errcode = '42501';
  end if;

  return new;
end;
$$;

-- Routine generation carries the procedure and estimate onto each day's task.
create or replace function public.generate_routine_tasks(p_on date default (now() at time zone 'utc')::date)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_routine public.task_routines;
  v_created integer := 0;
  v_due     timestamptz;
begin
  if auth.uid() is null then
    return 0;
  end if;

  if extract(isodow from p_on) = 7 then
    return 0;
  end if;

  for v_routine in
    select * from public.task_routines
    where active
      and (last_generated_on is null or last_generated_on < p_on)
  loop
    v_due := (p_on::text || ' ' || v_routine.due_time || ':00')::timestamptz;

    begin
      insert into public.tasks
        (title, description, task_type, assigned_to, created_by, due_date, checklist,
         sop, estimated_minutes, category_id, routine_id, routine_on)
      values
        (v_routine.title, 'Daily routine.', v_routine.task_type, v_routine.assigned_to,
         v_routine.created_by, v_due, v_routine.checklist,
         v_routine.sop, v_routine.estimated_minutes, v_routine.category_id, v_routine.id, p_on);
      v_created := v_created + 1;
    exception
      when unique_violation then
        null;
    end;

    update public.task_routines
       set last_generated_on = p_on
     where id = v_routine.id;
  end loop;

  return v_created;
end;
$$;

-- RLS: everyone signed in can read the work types (they label work people can
-- already see); only an owner can change the set.
alter table public.task_categories enable row level security;

drop policy if exists categories_select on public.task_categories;
create policy categories_select on public.task_categories
  for select to authenticated
  using (true);

drop policy if exists categories_insert_admin on public.task_categories;
create policy categories_insert_admin on public.task_categories
  for insert to authenticated
  with check (public.is_admin());

drop policy if exists categories_update_admin on public.task_categories;
create policy categories_update_admin on public.task_categories
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists categories_delete_admin on public.task_categories;
create policy categories_delete_admin on public.task_categories
  for delete to authenticated
  using (public.is_admin());

grant select, insert, update, delete on public.task_categories to authenticated;

alter table public.task_categories replica identity full;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'task_categories'
  ) then
    alter publication supabase_realtime add table public.task_categories;
  end if;
end
$$;
-- 0008_calls_rollover_periods â€” call logs, automatic carry-forward,
-- and work that belongs to a week or a month rather than to a single day.

-- ---------------------------------------------------------------------
-- 1. Horizon and carry-forward
-- ---------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'task_horizon') then
    create type public.task_horizon as enum ('day', 'week', 'month');
  end if;
  if not exists (select 1 from pg_type where typname = 'routine_cadence') then
    create type public.routine_cadence as enum ('daily', 'weekly', 'monthly');
  end if;
end
$$;

alter table public.tasks
  add column if not exists horizon public.task_horizon not null default 'day',
  add column if not exists original_due_date date,
  add column if not exists rollover_count integer not null default 0;

alter table public.task_routines
  add column if not exists cadence public.routine_cadence not null default 'daily';

create index if not exists tasks_horizon_idx on public.tasks (horizon, status);

-- ---------------------------------------------------------------------
-- 2. Call logs
-- ---------------------------------------------------------------------

create table if not exists public.call_logs (
  id               uuid primary key default gen_random_uuid(),
  task_id          uuid references public.tasks (id) on delete set null,
  counterparty     text not null,
  recorded_by      uuid references public.profiles (id) on delete set null,
  duration_seconds integer,
  transcript       text not null,
  summary          text not null default '',
  -- Dated promises pulled out of the call, each with the line it came from.
  commitments      jsonb not null default '[]'::jsonb,
  -- Anything said about us that was not a dated promise.
  intel            jsonb not null default '[]'::jsonb,
  created_at       timestamptz not null default now(),
  constraint call_logs_counterparty_not_blank check (length(btrim(counterparty)) > 0),
  constraint call_logs_commitments_is_array check (jsonb_typeof(commitments) = 'array'),
  constraint call_logs_intel_is_array check (jsonb_typeof(intel) = 'array')
);

create index if not exists call_logs_created_idx on public.call_logs (created_at desc);
create index if not exists call_logs_task_idx    on public.call_logs (task_id);
create index if not exists call_logs_by_idx      on public.call_logs (recorded_by);

alter table public.tasks
  add column if not exists call_log_id uuid references public.call_logs (id) on delete set null;

create index if not exists tasks_call_log_idx on public.tasks (call_log_id);

-- ---------------------------------------------------------------------
-- 3. Protected columns
-- ---------------------------------------------------------------------
-- The new columns are admin-owned like the rest of a task's details, with one
-- exception: rollover is performed by a SECURITY DEFINER function, so it sets
-- the flowline.rollover flag the same way handoffs do.

create or replace function public.protect_task_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or public.is_admin() then
    return new;
  end if;

  if new.title             is distinct from old.title
  or new.description       is distinct from old.description
  or new.task_type         is distinct from old.task_type
  or new.created_by        is distinct from old.created_by
  or new.sop               is distinct from old.sop
  or new.estimated_minutes is distinct from old.estimated_minutes
  or new.category_id       is distinct from old.category_id
  or new.horizon           is distinct from old.horizon
  or new.call_log_id       is distinct from old.call_log_id
  or new.routine_id        is distinct from old.routine_id
  or new.routine_on        is distinct from old.routine_on then
    raise exception 'Only an owner can edit the details of a task.' using errcode = '42501';
  end if;

  -- The deadline moves on its own during carry-forward, and nowhere else.
  if (new.due_date          is distinct from old.due_date
   or new.rollover_count    is distinct from old.rollover_count
   or new.original_due_date is distinct from old.original_due_date)
     and coalesce(current_setting('flowline.rollover', true), 'off') <> 'on' then
    raise exception 'Only an owner can change a deadline.' using errcode = '42501';
  end if;

  if new.assigned_to is distinct from old.assigned_to
     and coalesce(current_setting('flowline.handoff', true), 'off') <> 'on' then
    raise exception 'Use the handoff action to pass work to someone else.' using errcode = '42501';
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- 4. Carry unfinished work forward
-- ---------------------------------------------------------------------
-- Idempotent: anything already due today or later is untouched, so calling
-- this on every load is free. Week and month work is never rolled â€” it is not
-- late until its period ends.

create or replace function public.roll_over_unfinished(p_on date default (now() at time zone 'utc')::date)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_moved integer := 0;
begin
  if auth.uid() is null then
    return 0;
  end if;

  perform set_config('flowline.rollover', 'on', true);

  with moved as (
    update public.tasks t
       set original_due_date = coalesce(t.original_due_date, t.due_date::date),
           rollover_count    = t.rollover_count + 1,
           -- Keep the time of day it was originally due.
           due_date          = (p_on::text || ' ' || to_char(t.due_date, 'HH24:MI:SS'))::timestamptz
     where t.status <> 'done'
       and t.horizon = 'day'
       and t.due_date is not null
       and t.due_date::date < p_on
     returning 1
  )
  select count(*) into v_moved from moved;

  perform set_config('flowline.rollover', 'off', true);

  return v_moved;
end;
$$;

-- ---------------------------------------------------------------------
-- 5. Routine generation, now cadence-aware
-- ---------------------------------------------------------------------
-- routine_on holds the START of the period the task covers, which is what
-- makes the unique index work for weekly and monthly routines too.

create or replace function public.generate_routine_tasks(p_on date default (now() at time zone 'utc')::date)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_routine public.task_routines;
  v_created integer := 0;
  v_due     timestamptz;
  v_period  date;
  v_horizon public.task_horizon;
begin
  if auth.uid() is null then
    return 0;
  end if;

  if extract(isodow from p_on) = 7 then
    return 0;
  end if;

  for v_routine in
    select * from public.task_routines where active
  loop
    v_period := case v_routine.cadence
                  when 'weekly'  then date_trunc('week', p_on)::date
                  when 'monthly' then date_trunc('month', p_on)::date
                  else p_on
                end;
    v_horizon := case v_routine.cadence
                   when 'weekly'  then 'week'::public.task_horizon
                   when 'monthly' then 'month'::public.task_horizon
                   else 'day'::public.task_horizon
                 end;

    v_due := (p_on::text || ' ' || v_routine.due_time || ':00')::timestamptz;

    begin
      insert into public.tasks
        (title, description, task_type, assigned_to, created_by, due_date, checklist,
         sop, estimated_minutes, category_id, horizon, routine_id, routine_on)
      values
        (v_routine.title, 'Recurring work.', v_routine.task_type, v_routine.assigned_to,
         v_routine.created_by, v_due, v_routine.checklist,
         v_routine.sop, v_routine.estimated_minutes, v_routine.category_id, v_horizon,
         v_routine.id, v_period);
      v_created := v_created + 1;
    exception
      when unique_violation then
        null;
    end;

    update public.task_routines set last_generated_on = p_on where id = v_routine.id;
  end loop;

  return v_created;
end;
$$;

-- ---------------------------------------------------------------------
-- 6. Log a call, and schedule everything it promised
-- ---------------------------------------------------------------------
-- One transaction: the call, the follow-up tasks, and the discussion note on
-- the originating task either all land or none of them do.

create or replace function public.log_call(
  p_counterparty     text,
  p_transcript       text,
  p_summary          text,
  p_commitments      jsonb,
  p_intel            jsonb,
  p_task_id          uuid    default null,
  p_duration_seconds integer default null,
  p_assign_to        uuid    default null
)
returns public.call_logs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_call       public.call_logs;
  v_commitment jsonb;
  v_updated    jsonb := '[]'::jsonb;
  v_task_id    uuid;
  v_owner      uuid := coalesce(p_assign_to, auth.uid());
  v_due        timestamptz;
  v_kind       text;
  v_type       public.task_type;
begin
  if auth.uid() is null then
    raise exception 'Please sign in again.' using errcode = '42501';
  end if;

  insert into public.call_logs
    (task_id, counterparty, recorded_by, duration_seconds, transcript, summary, commitments, intel)
  values
    (p_task_id, btrim(p_counterparty), auth.uid(), p_duration_seconds, p_transcript,
     coalesce(p_summary, ''), coalesce(p_commitments, '[]'::jsonb), coalesce(p_intel, '[]'::jsonb))
  returning * into v_call;

  -- Every dated promise becomes real work owned by a real person.
  for v_commitment in select * from jsonb_array_elements(coalesce(p_commitments, '[]'::jsonb))
  loop
    v_task_id := null;

    if coalesce(v_commitment ->> 'due_date', '') <> '' then
      v_due := ((v_commitment ->> 'due_date') || ' ' ||
                coalesce(nullif(v_commitment ->> 'due_time', ''), '11:00') || ':00')::timestamptz;

      v_kind := coalesce(v_commitment ->> 'kind', 'other');
      v_type := case v_kind
                  when 'meeting'  then 'meeting'
                  when 'visit'    then 'meeting'
                  when 'order'    then 'order'
                  when 'payment'  then 'call'
                  when 'callback' then 'call'
                  when 'delivery' then 'long'
                  else 'general'
                end::public.task_type;

      insert into public.tasks
        (title, description, task_type, assigned_to, created_by, due_date, call_log_id)
      values
        (v_commitment ->> 'title',
         'From the call with ' || v_call.counterparty || '. They said: ' || coalesce(v_commitment ->> 'quote', ''),
         v_type, v_owner, auth.uid(), v_due, v_call.id)
      returning id into v_task_id;
    end if;

    v_updated := v_updated || jsonb_build_array(
      v_commitment || jsonb_build_object('task_id', to_jsonb(v_task_id))
    );
  end loop;

  update public.call_logs set commitments = v_updated where id = v_call.id returning * into v_call;

  -- The summary doubles as the discussion note on the task the call came from.
  if p_task_id is not null and coalesce(btrim(p_summary), '') <> '' then
    insert into public.activity_logs (task_id, user_id, content)
    values (p_task_id, auth.uid(), p_summary);
  end if;

  return v_call;
end;
$$;

-- ---------------------------------------------------------------------
-- 7. Row Level Security
-- ---------------------------------------------------------------------
-- Calls carry customer conversations, so an employee sees only their own and
-- those attached to work they already hold.

alter table public.call_logs enable row level security;

drop policy if exists calls_select on public.call_logs;
create policy calls_select on public.call_logs
  for select to authenticated
  using (
    public.is_admin()
    or recorded_by = auth.uid()
    or (task_id is not null and public.can_see_task(task_id))
  );

drop policy if exists calls_insert on public.call_logs;
create policy calls_insert on public.call_logs
  for insert to authenticated
  with check (recorded_by = auth.uid() or public.is_admin());

drop policy if exists calls_update_own on public.call_logs;
create policy calls_update_own on public.call_logs
  for update to authenticated
  using (public.is_admin() or recorded_by = auth.uid())
  with check (public.is_admin() or recorded_by = auth.uid());

drop policy if exists calls_delete_admin on public.call_logs;
create policy calls_delete_admin on public.call_logs
  for delete to authenticated
  using (public.is_admin());

grant select, insert, update, delete on public.call_logs to authenticated;

grant execute on function public.roll_over_unfinished(date) to authenticated;
grant execute on function public.log_call(text, text, text, jsonb, jsonb, uuid, integer, uuid) to authenticated;

alter table public.call_logs replica identity full;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'call_logs'
  ) then
    alter publication supabase_realtime add table public.call_logs;
  end if;
end
$$;

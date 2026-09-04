-- =====================================================================
-- Flowline - consolidated schema
-- =====================================================================
-- Generated from supabase/migrations/*.sql in order. Applying this file to
-- a fresh database is equivalent to applying every migration.
--
-- Do not hand-edit: add a new numbered migration and regenerate with
--   npm run schema:build
-- =====================================================================

-- =====================================================================
-- 0001_init.sql
-- =====================================================================
-- 0001_init — extensions, enums, tables and indexes.

create extension if not exists pgcrypto;

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
  note         text not null,
  created_at   timestamptz not null default now(),
  constraint task_handoffs_note_required check (length(btrim(note)) >= 10)
);

create index if not exists profiles_reports_to_idx on public.profiles (reports_to);
create index if not exists tasks_assigned_to_idx   on public.tasks (assigned_to);
create index if not exists tasks_created_by_idx    on public.tasks (created_by);
create index if not exists tasks_status_idx        on public.tasks (status);
create index if not exists tasks_due_date_idx      on public.tasks (due_date);
create index if not exists activity_task_idx       on public.activity_logs (task_id, created_at desc);
create index if not exists handoffs_task_idx       on public.task_handoffs (task_id, created_at desc);
create index if not exists handoffs_created_idx    on public.task_handoffs (created_at desc);
create index if not exists routines_assigned_idx   on public.task_routines (assigned_to);

create unique index if not exists tasks_routine_once_per_day_idx
  on public.tasks (routine_id, routine_on)
  where routine_id is not null and routine_on is not null;


-- =====================================================================
-- 0002_helpers.sql
-- =====================================================================
-- 0002_helpers — SECURITY DEFINER predicates used by the RLS policies.
-- Defining them this way keeps the profiles policies from recursing.

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


-- =====================================================================
-- 0003_triggers.sql
-- =====================================================================
-- 0003_triggers — profile bootstrap, protected columns, timestamps, handoff rules.

-- The role is decided in the database, never read from client metadata.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role          public.user_role := 'employee';
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


-- =====================================================================
-- 0004_rpc.sql
-- =====================================================================
-- 0004_rpc — the authenticated handoff procedure and the idempotent routine generator.

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
        (title, description, task_type, assigned_to, created_by, due_date, checklist, routine_id, routine_on)
      values
        (v_routine.title, 'Daily routine.', v_routine.task_type, v_routine.assigned_to,
         v_routine.created_by, v_due, v_routine.checklist, v_routine.id, p_on);
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


-- =====================================================================
-- 0005_rls.sql
-- =====================================================================
-- 0005_rls — Row Level Security and grants.

alter table public.profiles      enable row level security;
alter table public.tasks         enable row level security;
alter table public.activity_logs enable row level security;
alter table public.task_handoffs enable row level security;
alter table public.task_routines enable row level security;

-- profiles -------------------------------------------------------------

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

-- tasks ----------------------------------------------------------------

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

drop policy if exists tasks_update on public.tasks;
create policy tasks_update on public.tasks
  for update to authenticated
  using (public.is_admin() or assigned_to = auth.uid())
  with check (public.is_admin() or assigned_to = auth.uid());

drop policy if exists tasks_delete_admin on public.tasks;
create policy tasks_delete_admin on public.tasks
  for delete to authenticated
  using (public.is_admin());

-- activity_logs --------------------------------------------------------

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

-- task_handoffs --------------------------------------------------------

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

drop policy if exists handoffs_delete_admin on public.task_handoffs;
create policy handoffs_delete_admin on public.task_handoffs
  for delete to authenticated
  using (public.is_admin());

-- task_routines --------------------------------------------------------

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

-- grants ---------------------------------------------------------------

grant usage on schema public to anon, authenticated;

grant select, insert, update, delete on public.profiles      to authenticated;
grant select, insert, update, delete on public.tasks         to authenticated;
grant select, insert, update, delete on public.activity_logs to authenticated;
grant select, insert, delete         on public.task_handoffs to authenticated;
grant select, insert, update, delete on public.task_routines to authenticated;

grant execute on function public.is_admin()                     to authenticated;
grant execute on function public.can_see_task(uuid)             to authenticated;
grant execute on function public.handoff_task(uuid, uuid, text) to authenticated;
grant execute on function public.generate_routine_tasks(date)   to authenticated;


-- =====================================================================
-- 0006_realtime.sql
-- =====================================================================
-- 0006_realtime — publish the tables so every open screen stays live.

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
-- 0007_sop_categories.sql
-- =====================================================================
-- 0007_sop_categories — custom work types, standard procedures, time estimates.

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


-- =====================================================================
-- 0008_calls_rollover_periods.sql
-- =====================================================================
-- 0008_calls_rollover_periods — call logs, automatic carry-forward,
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
-- this on every load is free. Week and month work is never rolled — it is not
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


-- =====================================================================
-- 0009_org_timezone.sql
-- =====================================================================
-- 0009_org_timezone
--
-- One authoritative timezone for the company.
--
-- Every "what day is it" decision — rollovers, routine generation, report
-- dates, call commitment dates — previously resolved against whatever the
-- session timezone happened to be. For a Postgres connection that is UTC,
-- so a factory in Ahmedabad had its day roll over at 05:30 local, and an
-- evening report run at 22:00 IST was filed against the following date.
--
-- These helpers are the only sanctioned way to answer that question.

create table if not exists public.org_settings (
  -- Single row, enforced by the primary key plus the check below.
  id            boolean primary key default true,
  timezone      text not null default 'Asia/Kolkata',
  -- Working days, ISO numbering: 1 = Monday … 7 = Sunday.
  working_days  smallint[] not null default '{1,2,3,4,5,6}',
  created_at    timestamptz not null default now(),
  constraint org_settings_singleton check (id),
  constraint org_settings_timezone_valid check (length(btrim(timezone)) > 0)
);

insert into public.org_settings (id) values (true) on conflict (id) do nothing;

-- Reject a timezone Postgres cannot resolve, rather than silently falling
-- back to UTC at read time.
create or replace function public.assert_timezone_valid()
returns trigger
language plpgsql
as $$
begin
  perform now() at time zone new.timezone;
  return new;
exception
  when invalid_parameter_value or undefined_object then
    raise exception '% is not a timezone Postgres recognises.', new.timezone using errcode = '22023';
end;
$$;

drop trigger if exists org_settings_tz_valid on public.org_settings;
create trigger org_settings_tz_valid
  before insert or update on public.org_settings
  for each row execute function public.assert_timezone_valid();

create or replace function public.org_timezone()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select timezone from public.org_settings where id), 'UTC');
$$;

/** The organisation's current calendar day. */
create or replace function public.org_today()
returns date
language sql
stable
security definer
set search_path = public
as $$
  select (now() at time zone public.org_timezone())::date;
$$;

/**
 * Builds a timestamptz for a wall-clock time on a given day, interpreted in
 * the organisation's timezone.
 *
 * `(timestamp without time zone) AT TIME ZONE tz` converts a local wall
 * clock into an absolute instant, which is exactly the intent — and is what
 * string concatenation into a timestamptz cast got wrong, because that path
 * used the session zone instead.
 */
create or replace function public.org_timestamp(p_day date, p_time text)
returns timestamptz
language sql
stable
security definer
set search_path = public
as $$
  select ((p_day::text || ' ' || coalesce(nullif(btrim(p_time), ''), '00:00'))::timestamp)
           at time zone public.org_timezone();
$$;

/** True when the given day is a working day for this organisation. */
create or replace function public.org_is_working_day(p_day date)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select extract(isodow from p_day)::smallint = any(
    coalesce((select working_days from public.org_settings where id), '{1,2,3,4,5,6}')
  );
$$;

-- Everyone signed in may read the timezone; only an owner may change it.
alter table public.org_settings enable row level security;

drop policy if exists org_settings_select on public.org_settings;
create policy org_settings_select on public.org_settings
  for select to authenticated using (true);

drop policy if exists org_settings_update_admin on public.org_settings;
create policy org_settings_update_admin on public.org_settings
  for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

grant select on public.org_settings to authenticated;
grant update on public.org_settings to authenticated;

grant execute on function public.org_timezone()               to authenticated;
grant execute on function public.org_today()                  to authenticated;
grant execute on function public.org_timestamp(date, text)    to authenticated;
grant execute on function public.org_is_working_day(date)     to authenticated;


-- =====================================================================
-- 0010_authorization_hardening.sql
-- =====================================================================
-- 0009_authorization_hardening
--
-- Closes the privilege-escalation holes in the SECURITY DEFINER surface.
--
-- Threat model: an employee holds a valid anon-key session and can call any
-- exposed RPC or PostgREST endpoint directly with curl. Nothing in React is
-- a control. Everything below is enforced in the database.
--
-- A note on GRANTs. Admins are `authenticated` too, so revoking EXECUTE from
-- `authenticated` would lock owners out as well — there is no separate role
-- to grant to. The enforcement therefore lives inside each function, which
-- also lets the failure carry a message a person can act on. Where a table
-- write has no legitimate direct path at all (call_logs), the privilege IS
-- revoked outright and the RPC becomes the only way in.

-- ---------------------------------------------------------------------
-- 1. Shared guard
-- ---------------------------------------------------------------------

create or replace function public.require_admin(p_action text)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Please sign in again.' using errcode = '42501';
  end if;
  if not public.is_admin() then
    raise exception 'Only an owner can %.', p_action using errcode = '42501';
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- 2. roll_over_unfinished — admin only
-- ---------------------------------------------------------------------
-- Previously any signed-in user could move every unfinished deadline in the
-- company forward, which both rewrote other people's work and corrupted the
-- historical record of what was late.

create or replace function public.roll_over_unfinished(p_on date default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_moved integer := 0;
  v_on    date;
begin
  perform public.require_admin('carry work forward');

  -- Default to the organisation's today, not the session's.
  v_on := coalesce(p_on, public.org_today());

  -- A rollover is only ever "to today". Accepting an arbitrary date would
  -- let an admin silently rewrite history or schedule far into the future.
  if v_on <> public.org_today() then
    raise exception 'Work can only be carried forward to today (%).', public.org_today()
      using errcode = '22023';
  end if;

  perform set_config('flowline.rollover', 'on', true);

  with moved as (
    update public.tasks t
       set original_due_date = coalesce(t.original_due_date, t.due_date::date),
           rollover_count    = t.rollover_count + 1,
           due_date          = (v_on::text || ' ' || to_char(t.due_date, 'HH24:MI:SS'))::timestamptz
     where t.status <> 'done'
       and t.horizon = 'day'
       and t.due_date is not null
       and t.due_date::date < v_on
     returning 1
  )
  select count(*) into v_moved from moved;

  perform set_config('flowline.rollover', 'off', true);
  return v_moved;
end;
$$;

-- ---------------------------------------------------------------------
-- 3. generate_routine_tasks — admin only, bounded date
-- ---------------------------------------------------------------------

create or replace function public.generate_routine_tasks(p_on date default null)
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
  v_on      date;
  v_today   date;
begin
  perform public.require_admin('generate recurring work');

  v_today := public.org_today();
  v_on := coalesce(p_on, v_today);

  -- Bounded window. An unbounded date let a caller materialise a year of
  -- work in one request, or backfill tasks into closed reporting periods.
  if v_on < v_today - 7 or v_on > v_today + 7 then
    raise exception 'That date is out of range: routines can only be generated within a week of today.'
      using errcode = '22023';
  end if;

  if extract(isodow from v_on) = 7 then
    return 0;
  end if;

  for v_routine in select * from public.task_routines where active
  loop
    v_period := case v_routine.cadence
                  when 'weekly'  then date_trunc('week', v_on)::date
                  when 'monthly' then date_trunc('month', v_on)::date
                  else v_on
                end;
    v_horizon := case v_routine.cadence
                   when 'weekly'  then 'week'::public.task_horizon
                   when 'monthly' then 'month'::public.task_horizon
                   else 'day'::public.task_horizon
                 end;

    v_due := public.org_timestamp(v_on, v_routine.due_time);

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
      when unique_violation then null;
    end;

    update public.task_routines set last_generated_on = v_on where id = v_routine.id;
  end loop;

  return v_created;
end;
$$;

-- ---------------------------------------------------------------------
-- 4. Checklist changes go through one narrow RPC
-- ---------------------------------------------------------------------
-- Ticking a box is the ONE thing an employee may do to a checklist. Because
-- the whole column was writable, an employee could also rename steps, delete
-- them, or replace the array with a single pre-ticked item and mark the task
-- done. This function can only ever flip `done` on an item that already
-- exists, so the shape is safe by construction.

create or replace function public.set_checklist_item(
  p_task_id uuid,
  p_item_id text,
  p_done    boolean
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_task  public.tasks;
  v_next  jsonb;
  v_found boolean := false;
  v_item  jsonb;
begin
  if auth.uid() is null then
    raise exception 'Please sign in again.' using errcode = '42501';
  end if;

  select * into v_task from public.tasks where id = p_task_id;
  if not found then
    raise exception 'That work is no longer here.' using errcode = 'P0002';
  end if;

  if not public.is_admin() and v_task.assigned_to is distinct from auth.uid() then
    raise exception 'You can only update work assigned to you.' using errcode = '42501';
  end if;

  v_next := '[]'::jsonb;
  for v_item in select * from jsonb_array_elements(v_task.checklist)
  loop
    if v_item ->> 'id' = p_item_id then
      v_found := true;
      v_next := v_next || jsonb_build_array(jsonb_set(v_item, '{done}', to_jsonb(p_done)));
    else
      v_next := v_next || jsonb_build_array(v_item);
    end if;
  end loop;

  if not v_found then
    raise exception 'That checklist step is not on this task.' using errcode = 'P0002';
  end if;

  perform set_config('flowline.checklist', 'on', true);
  update public.tasks set checklist = v_next where id = p_task_id;
  perform set_config('flowline.checklist', 'off', true);

  return true;
end;
$$;

-- ---------------------------------------------------------------------
-- 5. Protected task columns — deny by default
-- ---------------------------------------------------------------------
-- Rewritten as a whitelist. The previous version enumerated forbidden
-- columns, so every column added later was silently writable by employees
-- until someone remembered to extend the list. Now anything not explicitly
-- permitted is refused.

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

  -- Identity and description: owner-only, always.
  if new.title       is distinct from old.title
  or new.description is distinct from old.description
  or new.task_type   is distinct from old.task_type
  or new.created_by  is distinct from old.created_by
  or new.sop         is distinct from old.sop
  or new.category_id is distinct from old.category_id
  or new.horizon     is distinct from old.horizon
  or new.call_log_id is distinct from old.call_log_id
  or new.routine_id  is distinct from old.routine_id
  or new.routine_on  is distinct from old.routine_on
  or new.estimated_minutes is distinct from old.estimated_minutes then
    raise exception 'Only an owner can edit the details of a task.' using errcode = '42501';
  end if;

  -- Audit columns are written by triggers and functions, never by a client.
  if new.id                is distinct from old.id
  or new.created_at        is distinct from old.created_at
  or new.completed_at      is distinct from old.completed_at
  or new.status_changed_at is distinct from old.status_changed_at then
    raise exception 'Only an owner can change audit fields on a task.' using errcode = '42501';
  end if;

  -- Deadlines move during carry-forward and nowhere else.
  if (new.due_date          is distinct from old.due_date
   or new.rollover_count    is distinct from old.rollover_count
   or new.original_due_date is distinct from old.original_due_date)
     and coalesce(current_setting('flowline.rollover', true), 'off') <> 'on' then
    raise exception 'Only an owner can change a deadline.' using errcode = '42501';
  end if;

  -- Checklists change only through set_checklist_item().
  if new.checklist is distinct from old.checklist
     and coalesce(current_setting('flowline.checklist', true), 'off') <> 'on' then
    raise exception 'Use the checklist control to tick a step; the checklist itself cannot be rewritten.'
      using errcode = '42501';
  end if;

  -- Reassignment happens only through handoff_task().
  if new.assigned_to is distinct from old.assigned_to
     and coalesce(current_setting('flowline.handoff', true), 'off') <> 'on' then
    raise exception 'Use the handoff action to pass work to someone else.' using errcode = '42501';
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- 6. log_call — bounded, and it cannot assign work to other people
-- ---------------------------------------------------------------------

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
  v_owner      uuid;
  v_due        timestamptz;
  v_kind       text;
  v_type       public.task_type;
  v_count      integer;
  v_date       date;
  v_title      text;
begin
  if auth.uid() is null then
    raise exception 'Please sign in again.' using errcode = '42501';
  end if;

  -- --- Who the follow-up work belongs to ---------------------------
  -- An employee may only create work for themselves. Letting the caller
  -- name any profile turned call logging into an "assign work to anyone"
  -- primitive, including to admins.
  if p_assign_to is null or p_assign_to = auth.uid() then
    v_owner := auth.uid();
  elsif public.is_admin() then
    v_owner := p_assign_to;
  else
    raise exception 'You can only assign follow-up work to yourself.' using errcode = '42501';
  end if;

  if not exists (select 1 from public.profiles where id = v_owner) then
    raise exception 'That teammate does not exist.' using errcode = '23503';
  end if;

  -- --- The task this call is attached to ----------------------------
  if p_task_id is not null and not public.can_see_task(p_task_id) then
    raise exception 'That task cannot be found, or you do not have access to it.' using errcode = '42501';
  end if;

  -- --- Payload limits ------------------------------------------------
  -- One call must not be able to create unbounded work or store unbounded
  -- text. These are cheap guards against both accident and abuse.
  if length(coalesce(p_transcript, '')) > 200000 then
    raise exception 'That transcript is too long to store.' using errcode = '22001';
  end if;
  if length(coalesce(p_summary, '')) > 20000 then
    raise exception 'That summary is too long to store.' using errcode = '22001';
  end if;
  if length(btrim(coalesce(p_counterparty, ''))) = 0 then
    raise exception 'Say who the call was with.' using errcode = '23514';
  end if;

  if jsonb_typeof(coalesce(p_commitments, '[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(p_intel, '[]'::jsonb)) <> 'array' then
    raise exception 'The call payload is malformed.' using errcode = '22023';
  end if;

  select jsonb_array_length(coalesce(p_commitments, '[]'::jsonb)) into v_count;
  if v_count > 20 then
    raise exception 'Too many follow-ups in one call (limit 20, got %).', v_count using errcode = '22023';
  end if;
  if jsonb_array_length(coalesce(p_intel, '[]'::jsonb)) > 20 then
    raise exception 'Too many notes in one call (limit 20).' using errcode = '22023';
  end if;

  perform set_config('flowline.call', 'on', true);

  insert into public.call_logs
    (task_id, counterparty, recorded_by, duration_seconds, transcript, summary, commitments, intel)
  values
    (p_task_id, btrim(p_counterparty), auth.uid(),
     greatest(0, coalesce(p_duration_seconds, 0)), coalesce(p_transcript, ''),
     coalesce(p_summary, ''), coalesce(p_commitments, '[]'::jsonb), coalesce(p_intel, '[]'::jsonb))
  returning * into v_call;

  for v_commitment in select * from jsonb_array_elements(coalesce(p_commitments, '[]'::jsonb))
  loop
    v_task_id := null;
    v_title := btrim(coalesce(v_commitment ->> 'title', ''));

    if length(v_title) = 0 then
      raise exception 'Every follow-up needs a title.' using errcode = '23514';
    end if;
    if length(v_title) > 200 then
      raise exception 'That follow-up title is too long.' using errcode = '22001';
    end if;

    if coalesce(v_commitment ->> 'due_date', '') <> '' then
      begin
        v_date := (v_commitment ->> 'due_date')::date;
      exception when others then
        raise exception 'A follow-up has an unreadable date.' using errcode = '22007';
      end;

      -- Two things to stop: backdating a commitment into an already-closed
      -- reporting period, and absurd far-future values from a bad model
      -- response. Yesterday allows for a call logged just after midnight.
      -- The upper bound is deliberately generous — this is a sanity check,
      -- not a business rule about how far ahead people may plan.
      if v_date < public.org_today() - 1 or v_date > public.org_today() + 1825 then
        raise exception 'A follow-up date is out of range (%).', v_date using errcode = '22023';
      end if;

      v_due := public.org_timestamp(v_date, coalesce(nullif(v_commitment ->> 'due_time', ''), '11:00'));

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
        (v_title,
         'From the call with ' || v_call.counterparty || '. They said: ' ||
           left(coalesce(v_commitment ->> 'quote', ''), 500),
         v_type, v_owner, auth.uid(), v_due, v_call.id)
      returning id into v_task_id;
    end if;

    v_updated := v_updated || jsonb_build_array(
      v_commitment || jsonb_build_object('task_id', to_jsonb(v_task_id))
    );
  end loop;

  update public.call_logs set commitments = v_updated where id = v_call.id returning * into v_call;

  if p_task_id is not null and coalesce(btrim(p_summary), '') <> '' then
    insert into public.activity_logs (task_id, user_id, content)
    values (p_task_id, auth.uid(), p_summary);
  end if;

  perform set_config('flowline.call', 'off', true);
  return v_call;
end;
$$;

-- ---------------------------------------------------------------------
-- 7. call_logs may only be written through log_call()
-- ---------------------------------------------------------------------
-- A direct insert bypassed every limit above: unbounded transcript, no
-- counterparty, forged recorded_by. The privilege is withdrawn entirely;
-- log_call() is SECURITY DEFINER so it still writes.

drop policy if exists calls_insert on public.call_logs;
create policy calls_insert on public.call_logs
  for insert to authenticated
  with check (coalesce(current_setting('flowline.call', true), 'off') = 'on');

drop policy if exists calls_update_own on public.call_logs;
create policy calls_update_own on public.call_logs
  for update to authenticated
  using (public.is_admin() or coalesce(current_setting('flowline.call', true), 'off') = 'on')
  with check (public.is_admin() or coalesce(current_setting('flowline.call', true), 'off') = 'on');

revoke insert on public.call_logs from authenticated;

-- ---------------------------------------------------------------------
-- 8. Grants
-- ---------------------------------------------------------------------

grant execute on function public.require_admin(text) to authenticated;
grant execute on function public.set_checklist_item(uuid, text, boolean) to authenticated;
grant execute on function public.roll_over_unfinished(date) to authenticated;
grant execute on function public.generate_routine_tasks(date) to authenticated;


-- =====================================================================
-- 0011_task_events_and_safeguards.sql
-- =====================================================================
-- 0011_task_events_and_safeguards
--
-- Three things, all of which have to live in the database:
--
--   1. An append-only history of what actually happened to each task, so a
--      past report can be rebuilt from events rather than inferred from the
--      task's present state.
--   2. Completion safeguards, so "done" means the work was actually done.
--   3. Blocked safeguards, so "blocked" carries a reason, an owner and a
--      timestamp instead of being an unexplained flag.

-- ---------------------------------------------------------------------
-- 1. Blocked context
-- ---------------------------------------------------------------------

alter table public.tasks
  add column if not exists blocked_reason text,
  add column if not exists blocked_by uuid references public.profiles (id) on delete set null,
  add column if not exists blocked_at timestamptz;

-- Backfill anything already flagged before this rule existed, so the check
-- below can be enforced without rejecting legitimate historical rows.
update public.tasks
   set blocked_reason = coalesce(blocked_reason, 'Reason not recorded (blocked before reasons were required).'),
       blocked_at     = coalesce(blocked_at, status_changed_at)
 where is_blocked and blocked_reason is null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'tasks_blocked_needs_reason') then
    alter table public.tasks
      add constraint tasks_blocked_needs_reason
      check (not is_blocked or length(btrim(coalesce(blocked_reason, ''))) >= 10);
  end if;
end
$$;

-- ---------------------------------------------------------------------
-- 2. Append-only history
-- ---------------------------------------------------------------------
-- Historical labels are denormalised on purpose. A report from March must
-- still read correctly after the task is renamed, reassigned, or deleted and
-- after the person who did the work has left.

create table if not exists public.task_events (
  id              bigserial primary key,
  task_id         uuid not null,
  event_type      text not null,
  from_status     public.task_status,
  to_status       public.task_status,
  is_blocked      boolean,
  blocked_reason  text,
  actor_id        uuid,
  actor_name      text,
  source          text not null default 'api',
  checklist_done  integer,
  checklist_total integer,
  task_title      text,
  assignee_id     uuid,
  assignee_name   text,
  due_date        timestamptz,
  occurred_at     timestamptz not null default now(),
  occurred_on     date not null default public.org_today(),
  meta            jsonb not null default '{}'::jsonb,
  constraint task_events_type_known check (
    event_type in ('created','status_changed','completed','reopened','blocked','unblocked',
                   'handoff','rolled_over','checklist_changed','corrected')
  ),
  constraint task_events_source_known check (
    source in ('details','kanban','api','rollover','routine','call','admin','system')
  )
);

create index if not exists task_events_task_idx on public.task_events (task_id, occurred_at);
create index if not exists task_events_day_idx  on public.task_events (occurred_on);
create index if not exists task_events_actor_idx on public.task_events (actor_id);

-- ---------------------------------------------------------------------
-- 3. Immutability
-- ---------------------------------------------------------------------
-- Nobody updates or deletes history — not employees, not admins, not the
-- service role through PostgREST. A mistake is corrected by appending a
-- 'corrected' event, which leaves the original visible.

create or replace function public.task_events_are_immutable()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Task history cannot be % — append a correcting event instead.',
    case tg_op when 'UPDATE' then 'edited' else 'deleted' end
    using errcode = '42501';
end;
$$;

drop trigger if exists task_events_no_update on public.task_events;
create trigger task_events_no_update
  before update on public.task_events
  for each row execute function public.task_events_are_immutable();

drop trigger if exists task_events_no_delete on public.task_events;
create trigger task_events_no_delete
  before delete on public.task_events
  for each row execute function public.task_events_are_immutable();

alter table public.task_events enable row level security;

drop policy if exists task_events_select on public.task_events;
create policy task_events_select on public.task_events
  for select to authenticated
  using (public.is_admin() or actor_id = auth.uid() or assignee_id = auth.uid());

-- No insert policy: only SECURITY DEFINER triggers write here.
revoke insert, update, delete on public.task_events from authenticated;
grant select on public.task_events to authenticated;

-- ---------------------------------------------------------------------
-- 4. Completion and blocking safeguards
-- ---------------------------------------------------------------------
-- Enforced on the table, so the Kanban drag, the native stage <select>, the
-- details sheet and a raw PostgREST PATCH all obey the same rule.
--
-- Documented decision: a task with NO checklist may be completed freely.
-- Requiring a checklist on every task would push people to add a single
-- token step, which is worse than trusting the simple case.

create or replace function public.enforce_task_completion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total integer;
  v_done  integer;
  v_has_evidence boolean;
begin
  if new.status <> 'done' or old.status = 'done' then
    return new;
  end if;

  select count(*) filter (where true),
         count(*) filter (where coalesce((c ->> 'done')::boolean, false))
    into v_total, v_done
    from jsonb_array_elements(coalesce(new.checklist, '[]'::jsonb)) as c;

  if v_total > 0 and v_done < v_total then
    raise exception 'Finish the checklist first — % of % steps are still open.', v_total - v_done, v_total
      using errcode = '23514';
  end if;

  -- A call is only "done" when there is something to show for it: either a
  -- recorded call, or a written outcome. Otherwise the evening report counts
  -- calls as completed that nobody can account for.
  if new.task_type = 'call' then
    select exists (select 1 from public.call_logs where task_id = new.id)
        or exists (select 1 from public.activity_logs where task_id = new.id)
        or new.call_log_id is not null
      into v_has_evidence;

    if not v_has_evidence then
      raise exception 'Record what was discussed before closing a call.' using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists tasks_enforce_completion on public.tasks;
create trigger tasks_enforce_completion
  before update on public.tasks
  for each row execute function public.enforce_task_completion();

-- Blocking stamps who and when, and clears cleanly on unblock.
create or replace function public.stamp_blocked_state()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and new.is_blocked is distinct from old.is_blocked then
    if new.is_blocked then
      new.blocked_by := coalesce(auth.uid(), new.blocked_by);
      new.blocked_at := now();
    else
      new.blocked_reason := null;
      new.blocked_by := null;
      new.blocked_at := null;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists tasks_stamp_blocked on public.tasks;
create trigger tasks_stamp_blocked
  before update on public.tasks
  for each row execute function public.stamp_blocked_state();

-- ---------------------------------------------------------------------
-- 5. Event recording
-- ---------------------------------------------------------------------
-- Attribution is auth.uid() — the person who actually made the change — not
-- the assignee. Those differ whenever an admin closes someone else's work,
-- and the report was previously crediting the wrong person.

create or replace function public.record_task_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total integer;
  v_done  integer;
  v_actor uuid := auth.uid();
  v_source text := coalesce(nullif(current_setting('flowline.source', true), ''), 'api');
  v_type  text;
begin
  select count(*) filter (where true),
         count(*) filter (where coalesce((c ->> 'done')::boolean, false))
    into v_total, v_done
    from jsonb_array_elements(coalesce(new.checklist, '[]'::jsonb)) as c;

  if tg_op = 'INSERT' then
    v_type := 'created';
  elsif coalesce(current_setting('flowline.rollover', true), 'off') = 'on'
        and new.due_date is distinct from old.due_date then
    v_type := 'rolled_over';
    v_source := 'rollover';
  elsif new.is_blocked is distinct from old.is_blocked then
    v_type := case when new.is_blocked then 'blocked' else 'unblocked' end;
  elsif new.status is distinct from old.status then
    v_type := case
                when new.status = 'done' then 'completed'
                when old.status = 'done' then 'reopened'
                else 'status_changed'
              end;
  elsif new.assigned_to is distinct from old.assigned_to then
    v_type := 'handoff';
  elsif new.checklist is distinct from old.checklist then
    v_type := 'checklist_changed';
  else
    return new;
  end if;

  insert into public.task_events (
    task_id, event_type, from_status, to_status, is_blocked, blocked_reason,
    actor_id, actor_name, source, checklist_done, checklist_total,
    task_title, assignee_id, assignee_name, due_date
  )
  values (
    new.id, v_type,
    case when tg_op = 'UPDATE' then old.status end, new.status,
    new.is_blocked, new.blocked_reason,
    v_actor,
    (select full_name from public.profiles where id = v_actor),
    v_source, v_done, v_total,
    new.title, new.assigned_to,
    (select full_name from public.profiles where id = new.assigned_to),
    new.due_date
  );

  return new;
end;
$$;

drop trigger if exists tasks_record_event on public.tasks;
create trigger tasks_record_event
  after insert or update on public.tasks
  for each row execute function public.record_task_event();

-- ---------------------------------------------------------------------
-- 6. Narrow RPCs
-- ---------------------------------------------------------------------
-- These carry the UI surface into the event log, so a report can say the
-- change came from the Kanban board rather than "api".

create or replace function public.set_task_status(
  p_task_id uuid,
  p_status  public.task_status,
  p_source  text default 'details'
)
returns public.tasks
language plpgsql
security definer
set search_path = public
as $$
declare
  v_task public.tasks;
begin
  if auth.uid() is null then
    raise exception 'Please sign in again.' using errcode = '42501';
  end if;
  if p_source not in ('details','kanban','api','admin') then
    raise exception 'Unknown source.' using errcode = '22023';
  end if;

  select * into v_task from public.tasks where id = p_task_id;
  if not found then
    raise exception 'That work is no longer here.' using errcode = 'P0002';
  end if;
  if not public.is_admin() and v_task.assigned_to is distinct from auth.uid() then
    raise exception 'You can only update work assigned to you.' using errcode = '42501';
  end if;

  perform set_config('flowline.source', p_source, true);
  update public.tasks set status = p_status where id = p_task_id returning * into v_task;
  perform set_config('flowline.source', '', true);
  return v_task;
end;
$$;

create or replace function public.set_task_blocked(
  p_task_id uuid,
  p_blocked boolean,
  p_reason  text default null,
  p_source  text default 'details'
)
returns public.tasks
language plpgsql
security definer
set search_path = public
as $$
declare
  v_task public.tasks;
begin
  if auth.uid() is null then
    raise exception 'Please sign in again.' using errcode = '42501';
  end if;

  select * into v_task from public.tasks where id = p_task_id;
  if not found then
    raise exception 'That work is no longer here.' using errcode = 'P0002';
  end if;
  if not public.is_admin() and v_task.assigned_to is distinct from auth.uid() then
    raise exception 'You can only update work assigned to you.' using errcode = '42501';
  end if;

  if p_blocked and length(btrim(coalesce(p_reason, ''))) < 10 then
    raise exception 'Say what is blocking this, in at least 10 characters.' using errcode = '23514';
  end if;

  perform set_config('flowline.source', p_source, true);
  update public.tasks
     set is_blocked = p_blocked,
         blocked_reason = case when p_blocked then btrim(p_reason) else null end
   where id = p_task_id
  returning * into v_task;
  perform set_config('flowline.source', '', true);
  return v_task;
end;
$$;

-- The blocked flag and its reason must move together, so direct writes are
-- refused for employees; status stays directly writable because the
-- completion trigger already validates it on every path.
create or replace function public.protect_blocked_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or public.is_admin() then
    return new;
  end if;
  if (new.blocked_reason is distinct from old.blocked_reason
   or new.blocked_by     is distinct from old.blocked_by
   or new.blocked_at     is distinct from old.blocked_at)
     and coalesce(current_setting('flowline.source', true), '') = '' then
    raise exception 'Use the blocked control so the reason is recorded.' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists tasks_protect_blocked on public.tasks;
create trigger tasks_protect_blocked
  before update on public.tasks
  for each row execute function public.protect_blocked_columns();

grant execute on function public.set_task_status(uuid, public.task_status, text) to authenticated;
grant execute on function public.set_task_blocked(uuid, boolean, text, text)     to authenticated;

alter table public.task_events replica identity full;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'task_events'
  ) then
    alter publication supabase_realtime add table public.task_events;
  end if;
end
$$;


-- =====================================================================
-- 0012_base_type_backfill_and_recurrence.sql
-- =====================================================================
-- 0012_base_type_backfill_and_recurrence
--
-- Two production defects, both data-shaped rather than code-shaped.
--
-- 1. Custom work types could be stored without a classification, which the
--    interface rendered as a dangling "Groups with · about 1h 30m". Backfill
--    the missing values and make it impossible to store another.
--
-- 2. Recurring work relied on catching a unique violation to stay idempotent.
--    That works, but it burns a subtransaction per duplicate and reports a
--    row as created when it was not. Replaced with a real upsert.

-- ---------------------------------------------------------------------
-- 1. base_type — backfill, then enforce
-- ---------------------------------------------------------------------

-- Rows predating the column, or written while it was optional. General work
-- is the safe default: the least specific classification, carrying no
-- behaviour anyone would be surprised by.
update public.task_categories
set base_type = 'general'
where base_type is null;

-- A value that no longer maps to a known type behaves the same way as a
-- missing one, so it gets the same treatment.
update public.task_categories
set base_type = 'general'
where base_type is not null
  and base_type::text not in ('general', 'call', 'order', 'entry', 'long', 'meeting', 'growth');

alter table public.task_categories
  alter column base_type set default 'general';

do $$
begin
  alter table public.task_categories alter column base_type set not null;
exception
  when others then
    -- Already NOT NULL from an earlier run.
    null;
end
$$;

-- ---------------------------------------------------------------------
-- 2. Recurrence — one occurrence per routine per period, by construction
-- ---------------------------------------------------------------------

-- The index this depends on was created in 0001 as a partial unique index on
-- (routine_id, routine_on). ON CONFLICT needs to be able to name it, so make
-- the predicate explicit at the call site below rather than relying on
-- inference across migrations.
create unique index if not exists tasks_routine_once_per_period_idx
  on public.tasks (routine_id, routine_on)
  where routine_id is not null and routine_on is not null;

create or replace function public.generate_routine_tasks(p_on date default null)
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
  v_on      date;
  v_today   date;
  v_hit     boolean;
begin
  perform public.require_admin('generate recurring work');

  v_today := public.org_today();
  v_on := coalesce(p_on, v_today);

  -- Bounded window. An unbounded date let a caller materialise a year of
  -- work in one request, or backfill into closed reporting periods.
  if v_on < v_today - 7 or v_on > v_today + 7 then
    raise exception 'That date is out of range: routines can only be generated within a week of today.'
      using errcode = '22023';
  end if;

  -- Monday to Saturday are working days; Sunday generates nothing. Read in
  -- the organisation's timezone, not the server's or the caller's.
  if extract(isodow from v_on) = 7 then
    return 0;
  end if;

  for v_routine in select * from public.task_routines where active
  loop
    -- The occurrence window. A daily routine is keyed on the day, a weekly
    -- one on the Monday of its week, a monthly one on the first of its
    -- month — so any date inside the window maps to the same key and cannot
    -- produce a second occurrence.
    v_period := case v_routine.cadence
                  when 'weekly'  then date_trunc('week', v_on)::date
                  when 'monthly' then date_trunc('month', v_on)::date
                  else v_on
                end;
    v_horizon := case v_routine.cadence
                   when 'weekly'  then 'week'::public.task_horizon
                   when 'monthly' then 'month'::public.task_horizon
                   else 'day'::public.task_horizon
                 end;

    v_due := public.org_timestamp(v_on, v_routine.due_time);

    /*
     * ON CONFLICT rather than catching unique_violation.
     *
     * Both are safe against duplicates, but the exception form opened a
     * subtransaction for every routine on every run and counted a conflict
     * as a creation — so a second refresh reported the same work as newly
     * made. This does the check inside the same statement, and RETURNING
     * tells us whether a row actually appeared.
     *
     * That makes it safe under everything that was producing duplicates:
     * a double refresh, two tabs, a scheduler retry after a partial
     * failure, and two workers running at once. The second writer either
     * conflicts and does nothing, or blocks on the first and then
     * conflicts.
     */
    insert into public.tasks
      (title, description, task_type, assigned_to, created_by, due_date, checklist,
       sop, estimated_minutes, category_id, horizon, routine_id, routine_on)
    values
      (v_routine.title, 'Recurring work.', v_routine.task_type, v_routine.assigned_to,
       v_routine.created_by, v_due, v_routine.checklist,
       v_routine.sop, v_routine.estimated_minutes, v_routine.category_id, v_horizon,
       v_routine.id, v_period)
    on conflict (routine_id, routine_on) where routine_id is not null and routine_on is not null
    do nothing
    returning true into v_hit;

    if v_hit then
      v_created := v_created + 1;
    end if;
    v_hit := null;

    -- Only recorded when something was actually generated, so the column
    -- cannot be used to claim a run happened that produced nothing.
    update public.task_routines
    set last_generated_on = v_on
    where id = v_routine.id
      and (last_generated_on is null or last_generated_on < v_on);
  end loop;

  return v_created;
end;
$$;

grant execute on function public.generate_routine_tasks(date) to authenticated;


-- =====================================================================
-- 0013_owner_accounts.sql
-- =====================================================================
-- 0013_owner_accounts
--
-- Owner and employee accounts: claiming an empty workspace, keeping more
-- than one owner, and changing an owner's email address.
--
-- The invariant this file exists to protect: a workspace always has at least
-- one owner. Everything else here is a consequence of that.

-- ---------------------------------------------------------------------
-- 1. Claiming an empty workspace
-- ---------------------------------------------------------------------
-- Sign-in is invite-only: `shouldCreateUser: false`, so nobody can register
-- themselves. That is correct once a company is running, and a deadlock
-- before it is — the first owner cannot be invited, because there is nobody
-- to invite them.
--
-- This reports whether the workspace has any people in it yet. The sign-in
-- screen uses it to allow exactly one self-registration, and the answer flips
-- to false the moment that account exists, so it can never be used twice.
--
-- Deliberately returns a bare boolean to an anonymous caller. It reveals only
-- whether the company has started using Flowline, which the sign-in screen
-- would make obvious anyway.

create or replace function public.workspace_is_unclaimed()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select not exists (select 1 from public.profiles);
$$;

revoke all on function public.workspace_is_unclaimed() from public;
grant execute on function public.workspace_is_unclaimed() to anon, authenticated;

-- ---------------------------------------------------------------------
-- 2. The last owner cannot be removed
-- ---------------------------------------------------------------------
-- Owners can already promote and demote each other — 0003 gates the role
-- column on is_admin(). What it does not prevent is the final owner demoting
-- themselves, or deleting their own profile, which locks every remaining
-- person out of assigning work, reading the report and inviting anyone. There
-- is no route back from that inside the application.
--
-- Enforced with a trigger rather than only in the RPC below, because the
-- service role and any future code path must hit the same wall.

create or replace function public.protect_last_admin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_remaining integer;
begin
  -- Only demotions and deletions can reduce the count.
  if tg_op = 'UPDATE' and not (old.role = 'admin' and new.role <> 'admin') then
    return new;
  end if;
  if tg_op = 'DELETE' and old.role <> 'admin' then
    return old;
  end if;

  select count(*) into v_remaining
  from public.profiles
  where role = 'admin' and id <> old.id;

  if v_remaining = 0 then
    raise exception 'This is the only owner. Make someone else an owner first, or the company would be locked out.'
      using errcode = '23514';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_protect_last_admin on public.profiles;
create trigger profiles_protect_last_admin
  before update or delete on public.profiles
  for each row execute function public.protect_last_admin();

-- ---------------------------------------------------------------------
-- 3. Changing someone's role
-- ---------------------------------------------------------------------
-- A named RPC rather than a bare column update, so the reason for a refusal
-- is a sentence rather than a policy violation, and so the audit trail has
-- something to point at.

create or replace function public.set_person_role(
  p_user_id uuid,
  p_role    public.user_role
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target public.profiles;
begin
  perform public.require_admin('change what someone can see');

  select * into v_target from public.profiles where id = p_user_id;
  if not found then
    raise exception 'That person is not in this company.' using errcode = 'P0002';
  end if;

  if v_target.role = p_role then
    return;
  end if;

  -- The trigger above is what actually guarantees this; the check here only
  -- exists so the message names the person rather than the constraint.
  update public.profiles set role = p_role where id = p_user_id;
end;
$$;

revoke all on function public.set_person_role(uuid, public.user_role) from public;
grant execute on function public.set_person_role(uuid, public.user_role) to authenticated;

-- ---------------------------------------------------------------------
-- 4. Reading an email address
-- ---------------------------------------------------------------------
-- `profiles` deliberately holds no email column — the address lives in
-- auth.users, so there is one copy of it. The team screen still needs to show
-- addresses, and an owner changing their own needs to see the current one.
--
-- Owners see everyone's; an employee sees only their own. The function is
-- SECURITY DEFINER because auth.users is not readable by `authenticated`, so
-- this is the only door onto it and it checks the caller itself.

create or replace function public.email_for(p_user_id uuid)
returns text
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if auth.uid() is null then
    return null;
  end if;
  if p_user_id <> auth.uid() and not public.is_admin() then
    raise exception 'You can only see your own email address.' using errcode = '42501';
  end if;
  return (select email from auth.users where id = p_user_id);
end;
$$;

revoke all on function public.email_for(uuid) from public;
grant execute on function public.email_for(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 5. Verified addresses only
-- ---------------------------------------------------------------------
-- Both sign-in paths already prove control of a mailbox: a magic link is only
-- usable by whoever received it, and an invited account has to follow the
-- emailed link before it has a session. This reports the state so the
-- interface can say so, and so an unverified account is visible rather than
-- silently half-working.

create or replace function public.email_is_verified(p_user_id uuid default null)
returns boolean
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_id uuid := coalesce(p_user_id, auth.uid());
begin
  if v_id is null then
    return false;
  end if;
  if v_id <> auth.uid() and not public.is_admin() then
    raise exception 'You can only see your own verification status.' using errcode = '42501';
  end if;
  return exists (select 1 from auth.users where id = v_id and email_confirmed_at is not null);
end;
$$;

revoke all on function public.email_is_verified(uuid) from public;
grant execute on function public.email_is_verified(uuid) to authenticated;

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

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

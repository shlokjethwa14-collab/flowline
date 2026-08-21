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

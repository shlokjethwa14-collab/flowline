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

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

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

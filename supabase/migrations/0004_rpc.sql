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

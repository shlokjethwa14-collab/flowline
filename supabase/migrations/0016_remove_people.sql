-- 0016_remove_people
--
-- Removing someone from the team.
--
-- The obvious implementation — delete the profile row — is the wrong one, and
-- quietly so. Every table that names a person does it with ON DELETE SET
-- NULL: tasks.assigned_to, activity_logs.user_id, task_handoffs.from_user_id
-- and to_user_id, call_logs.recorded_by. Deleting a profile therefore does
-- not just remove the person, it goes back through the record and blanks who
-- did what. Yesterday's Evening Report would still show the same numbers with
-- nobody attached to them, and the handoff trail — the one thing that
-- explains why work moved — becomes anonymous.
--
-- So removal is a state, not a deletion. The person stops being able to sign
-- in and disappears from every list, and the history stays exactly as it was.
--
-- A true delete remains available for the case it is actually right for: an
-- account created by mistake that has done nothing yet. That is guarded so it
-- cannot be used on anyone with a history.

alter table public.profiles
  add column if not exists deactivated_at timestamptz;

comment on column public.profiles.deactivated_at is
  'Set when someone is removed from the team. Their history stays; they cannot sign in and do not appear in lists.';

create index if not exists profiles_active_idx on public.profiles (deactivated_at) where deactivated_at is null;

-- ---------------------------------------------------------------------
-- Removing someone
-- ---------------------------------------------------------------------

create or replace function public.deactivate_person(
  p_user_id     uuid,
  p_reassign_to uuid default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target    public.profiles;
  v_moved     integer := 0;
  v_remaining integer;
begin
  perform public.require_admin('remove someone from the team');

  select * into v_target from public.profiles where id = p_user_id;
  if not found then
    raise exception 'That person is not in this company.' using errcode = 'P0002';
  end if;

  if v_target.deactivated_at is not null then
    return 0;
  end if;

  if p_user_id = auth.uid() then
    raise exception 'You cannot remove yourself. Ask another owner to do it.' using errcode = '42501';
  end if;

  -- The same rule the delete trigger enforces, stated here so the refusal
  -- names the situation rather than the constraint.
  if v_target.role = 'admin' then
    select count(*) into v_remaining
    from public.profiles
    where role = 'admin' and deactivated_at is null and id <> p_user_id;
    if v_remaining = 0 then
      raise exception 'This is the only owner left. Make someone else an owner first.' using errcode = '23514';
    end if;
  end if;

  /*
   * Unfinished work has to go somewhere. Left pointing at a removed person it
   * simply disappears from every screen — nobody's My Day shows it, and the
   * report counts it as scheduled and never done.
   *
   * Reassigned when a destination is given, otherwise unassigned so it
   * surfaces as work needing an owner. Finished work is left alone: it is
   * history, and it belongs to whoever did it.
   */
  update public.tasks
  set assigned_to = p_reassign_to
  where assigned_to = p_user_id
    and status <> 'done';
  get diagnostics v_moved = row_count;

  -- Anyone reporting to them now reports to whoever they reported to, so the
  -- chart does not sprout a detached branch.
  update public.profiles
  set reports_to = v_target.reports_to
  where reports_to = p_user_id;

  -- Their routines stop generating new work.
  update public.task_routines
  set active = false
  where assigned_to = p_user_id and active;

  update public.profiles
  set deactivated_at = now()
  where id = p_user_id;

  return v_moved;
end;
$$;

revoke all on function public.deactivate_person(uuid, uuid) from public;
grant execute on function public.deactivate_person(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------
-- Putting someone back
-- ---------------------------------------------------------------------

create or replace function public.reactivate_person(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.require_admin('restore someone to the team');
  update public.profiles set deactivated_at = null where id = p_user_id;
end;
$$;

revoke all on function public.reactivate_person(uuid) from public;
grant execute on function public.reactivate_person(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- Deleting outright — only when there is nothing to lose
-- ---------------------------------------------------------------------
-- For the mistyped account created a minute ago. The guard is the point: if
-- the person has done anything at all, deletion would blank their name out of
-- that record, so it is refused and removal is the answer instead.

create or replace function public.delete_person_permanently(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_history integer;
begin
  perform public.require_admin('delete an account');

  if p_user_id = auth.uid() then
    raise exception 'You cannot delete your own account.' using errcode = '42501';
  end if;

  select
    (select count(*) from public.tasks where assigned_to = p_user_id or created_by = p_user_id)
  + (select count(*) from public.activity_logs where user_id = p_user_id)
  + (select count(*) from public.task_handoffs where from_user_id = p_user_id or to_user_id = p_user_id)
  + (select count(*) from public.call_logs where recorded_by = p_user_id)
  into v_history;

  if v_history > 0 then
    raise exception
      'This person appears in % records. Deleting them would remove their name from work that already happened — remove them from the team instead.',
      v_history
      using errcode = '23514';
  end if;

  -- The last-owner trigger from 0013 also guards this path.
  delete from public.profiles where id = p_user_id;
end;
$$;

revoke all on function public.delete_person_permanently(uuid) from public;
grant execute on function public.delete_person_permanently(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- A removed person cannot sign in
-- ---------------------------------------------------------------------
-- Read by the client immediately after authenticating, so a removed account
-- is signed straight back out. Callable by anyone, because the caller has a
-- session but may not be allowed to read profiles yet.

create or replace function public.is_deactivated(p_user_id uuid default null)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = coalesce(p_user_id, auth.uid())
      and deactivated_at is not null
  );
$$;

revoke all on function public.is_deactivated(uuid) from public;
grant execute on function public.is_deactivated(uuid) to authenticated;

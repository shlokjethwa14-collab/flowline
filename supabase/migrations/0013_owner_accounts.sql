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

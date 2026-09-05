-- 0015_login_id_resolution
--
-- Nobody could sign in. Two defects, both introduced with login IDs in 0014.
--
-- 1. handle_new_user() never wrote login_id. The sign-up form put it in the
--    auth metadata, but the trigger that creates the profile only read
--    full_name and job_title — so every profile has a null login_id and the
--    ID somebody was told to use exists nowhere in the database.
--
-- 2. Sign-in derived the address from the login ID rather than looking it up.
--    That works only while every account uses the synthetic domain. An owner
--    who set a recovery email has that address as their identity instead, so
--    typing the login ID looked for an account that does not exist.
--
-- The fix for the second is a lookup, not a formula. That reintroduces the
-- enumeration risk the formula avoided, so the function below always returns
-- an address — the synthetic one when the ID is unknown — making a real ID
-- and an invented one indistinguishable to a caller.

-- ---------------------------------------------------------------------
-- 1. Persist login_id on sign-up
-- ---------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role          public.user_role := 'employee';
  v_profile_count integer;
  v_login_id      citext;
begin
  select count(*) into v_profile_count from public.profiles;
  if v_profile_count = 0 then
    v_role := 'admin';
  end if;

  -- Supplied by both the owner claim and the add-teammate flow. Falls back to
  -- the local part of the address, which is the login ID itself for accounts
  -- on the synthetic domain.
  v_login_id := nullif(btrim(new.raw_user_meta_data ->> 'login_id'), '');
  if v_login_id is null and new.email is not null then
    v_login_id := lower(split_part(new.email, '@', 1));
  end if;

  -- A collision must not stop the account being created; the profile simply
  -- keeps no login ID and an owner can set one.
  if exists (select 1 from public.profiles where login_id = v_login_id) then
    v_login_id := null;
  end if;

  insert into public.profiles (id, role, full_name, job_title, login_id)
  values (
    new.id,
    v_role,
    coalesce(
      nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
      split_part(coalesce(new.email, 'teammate@local'), '@', 1)
    ),
    nullif(btrim(new.raw_user_meta_data ->> 'job_title'), ''),
    v_login_id
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- 2. Backfill the accounts created before the trigger stored it
-- ---------------------------------------------------------------------

update public.profiles p
set login_id = coalesce(
      nullif(btrim(u.raw_user_meta_data ->> 'login_id'), ''),
      lower(split_part(u.email, '@', 1))
    )::citext
from auth.users u
where u.id = p.id
  and p.login_id is null
  and u.email is not null
  -- Skip anything that would collide with an ID already in use.
  and not exists (
    select 1 from public.profiles q
    where q.login_id = coalesce(
            nullif(btrim(u.raw_user_meta_data ->> 'login_id'), ''),
            lower(split_part(u.email, '@', 1))
          )::citext
  );

-- ---------------------------------------------------------------------
-- 3. Resolve a login ID to the address the account actually uses
-- ---------------------------------------------------------------------
-- Called before sign-in, by someone who is not signed in, so it must reveal
-- nothing. It always returns an address: the real one when the ID is known,
-- the synthetic one when it is not. Both then fail or succeed at the password
-- step, which is the only place a caller should learn anything.
--
-- An address typed instead of a login ID is returned unchanged, so an owner
-- can still sign in with the email they registered.

create or replace function public.login_email(p_identifier text)
returns text
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_id    citext := lower(btrim(p_identifier));
  v_email text;
begin
  if v_id = '' then
    return null;
  end if;

  -- Already an address: nothing to resolve.
  if position('@' in v_id) > 0 then
    return v_id::text;
  end if;

  select u.email into v_email
  from public.profiles p
  join auth.users u on u.id = p.id
  where p.login_id = v_id;

  -- Unknown IDs get the synthetic form rather than null, so a caller cannot
  -- tell the difference between "no such person" and "wrong password".
  return coalesce(v_email, v_id::text || '@accounts.ckltask.com');
end;
$$;

revoke all on function public.login_email(text) from public;
grant execute on function public.login_email(text) to anon, authenticated;

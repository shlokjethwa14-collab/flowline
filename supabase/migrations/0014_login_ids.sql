-- 0014_login_ids
--
-- Accounts identified by a login ID the owner issues, rather than by an email
-- address the person has to own.
--
-- Why: the people using Flowline are on a factory floor. Most have no work
-- email, so an emailed magic link asks them for something they do not have.
-- An owner handing over "suresh" and a password is how this actually works in
-- the building.
--
-- What this costs, recorded because it is a real loss and not an oversight:
--
--   * A login ID cannot be verified. An emailed link proves the person holds
--     the mailbox; nothing proves they hold a username. Trust now comes from
--     the owner having handed the credential over in person.
--   * An owner who can set anyone's password can sign in as them. That suits
--     an employer-owned tool, but it means an employee's actions are no
--     longer strictly non-repudiable, and the activity log should be read
--     with that in mind.
--
-- What this does NOT do: store or check passwords. Those stay entirely inside
-- Supabase Auth, which already salts and hashes them properly. A login ID is
-- mapped to a synthetic address and handed to the ordinary password sign-in,
-- so no part of this file ever sees a password.

-- ---------------------------------------------------------------------
-- 1. The login ID
-- ---------------------------------------------------------------------

create extension if not exists citext;

alter table public.profiles
  add column if not exists login_id citext;

-- Lowercase letters, digits, dot, underscore and hyphen. No spaces, no
-- capitals to mistype, and nothing that needs escaping when it becomes the
-- local part of an address.
alter table public.profiles
  drop constraint if exists profiles_login_id_shape;
alter table public.profiles
  add constraint profiles_login_id_shape
  check (login_id is null or login_id ~ '^[a-z0-9][a-z0-9._-]{2,30}$');

create unique index if not exists profiles_login_id_key
  on public.profiles (login_id)
  where login_id is not null;

comment on column public.profiles.login_id is
  'What the person types to sign in. Mapped to a synthetic address by the client; Supabase Auth still holds the password.';

-- ---------------------------------------------------------------------
-- 2. Who may set one
-- ---------------------------------------------------------------------
-- Changing your own login ID would change what you sign in with, so it is an
-- owner action like changing a role. Added to the existing column guard
-- rather than a second trigger, so there is one place that answers "what can
-- an employee change about their own profile".

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

  if new.login_id is distinct from old.login_id then
    raise exception 'Only an owner can change a login ID.' using errcode = '42501';
  end if;

  if new.id is distinct from old.id then
    raise exception 'A profile id cannot be changed.' using errcode = '42501';
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- 3. Is this login ID free?
-- ---------------------------------------------------------------------
-- The owner needs to know before handing a credential over. Admin-only: an
-- anonymous caller able to ask would be able to enumerate every account in
-- the company one guess at a time.

create or replace function public.login_id_available(p_login_id citext)
returns boolean
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  perform public.require_admin('check login IDs');
  return not exists (select 1 from public.profiles where login_id = p_login_id);
end;
$$;

revoke all on function public.login_id_available(citext) from public;
grant execute on function public.login_id_available(citext) to authenticated;

-- ---------------------------------------------------------------------
-- 4. The account list an owner manages
-- ---------------------------------------------------------------------
-- One call rather than a join the client has to assemble, because the email
-- lives in auth.users and is not readable by `authenticated`.

create or replace function public.admin_list_accounts()
returns table (
  id             uuid,
  full_name      text,
  job_title      text,
  role           public.user_role,
  login_id       citext,
  email          text,
  email_verified boolean,
  last_sign_in   timestamptz,
  created_at     timestamptz
)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  perform public.require_admin('list accounts');

  return query
  select p.id,
         p.full_name,
         p.job_title,
         p.role,
         p.login_id,
         u.email::text,
         u.email_confirmed_at is not null,
         u.last_sign_in_at,
         p.created_at
  from public.profiles p
  join auth.users u on u.id = p.id
  order by p.role, p.full_name;
end;
$$;

revoke all on function public.admin_list_accounts() from public;
grant execute on function public.admin_list_accounts() to authenticated;

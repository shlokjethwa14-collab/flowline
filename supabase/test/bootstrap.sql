-- =====================================================================
-- Test harness: the parts of Supabase the migrations depend on
-- =====================================================================
-- Recreates, on a plain PostgreSQL instance, exactly the surface the
-- migrations touch: the three Supabase roles, the auth schema, and
-- auth.uid() reading the JWT subject from a session setting.
--
-- This is what makes the permission tests meaningful. Row Level Security
-- is only enforced for a role that is NOT the table owner and does NOT
-- have BYPASSRLS, so tests must connect as postgres and then
-- `set local role authenticated` to be judged by the same rules a real
-- Supabase client is judged by.
-- =====================================================================

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end
$$;

create schema if not exists auth;

-- Stand-in for auth.users. Only the columns the migrations reference.
create table if not exists auth.users (
  id                  uuid primary key default gen_random_uuid(),
  email               text unique,
  raw_user_meta_data  jsonb not null default '{}'::jsonb,
  -- Supabase stamps this when a magic link or invite is followed. Flowline
  -- reads it to tell a verified address from an invited-but-unconfirmed one.
  email_confirmed_at  timestamptz default now(),
  created_at          timestamptz not null default now()
);

/**
 * Mirrors Supabase's own definition: the authenticated user id comes from
 * the request's JWT claims, exposed to SQL as a session setting. Tests set
 * `request.jwt.claim.sub` to impersonate a specific person.
 */
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

create or replace function auth.role()
returns text
language sql
stable
as $$
  select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'anon');
$$;

grant usage on schema auth to anon, authenticated, service_role;
grant select on auth.users to authenticated, service_role;

-- Supabase publishes changes on this publication; the migrations add tables
-- to it, so it has to exist before they run.
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end
$$;

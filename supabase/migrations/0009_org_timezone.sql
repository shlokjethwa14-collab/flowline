-- 0009_org_timezone
--
-- One authoritative timezone for the company.
--
-- Every "what day is it" decision — rollovers, routine generation, report
-- dates, call commitment dates — previously resolved against whatever the
-- session timezone happened to be. For a Postgres connection that is UTC,
-- so a factory in Ahmedabad had its day roll over at 05:30 local, and an
-- evening report run at 22:00 IST was filed against the following date.
--
-- These helpers are the only sanctioned way to answer that question.

create table if not exists public.org_settings (
  -- Single row, enforced by the primary key plus the check below.
  id            boolean primary key default true,
  timezone      text not null default 'Asia/Kolkata',
  -- Working days, ISO numbering: 1 = Monday … 7 = Sunday.
  working_days  smallint[] not null default '{1,2,3,4,5,6}',
  created_at    timestamptz not null default now(),
  constraint org_settings_singleton check (id),
  constraint org_settings_timezone_valid check (length(btrim(timezone)) > 0)
);

insert into public.org_settings (id) values (true) on conflict (id) do nothing;

-- Reject a timezone Postgres cannot resolve, rather than silently falling
-- back to UTC at read time.
create or replace function public.assert_timezone_valid()
returns trigger
language plpgsql
as $$
begin
  perform now() at time zone new.timezone;
  return new;
exception
  when invalid_parameter_value or undefined_object then
    raise exception '% is not a timezone Postgres recognises.', new.timezone using errcode = '22023';
end;
$$;

drop trigger if exists org_settings_tz_valid on public.org_settings;
create trigger org_settings_tz_valid
  before insert or update on public.org_settings
  for each row execute function public.assert_timezone_valid();

create or replace function public.org_timezone()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select timezone from public.org_settings where id), 'UTC');
$$;

/** The organisation's current calendar day. */
create or replace function public.org_today()
returns date
language sql
stable
security definer
set search_path = public
as $$
  select (now() at time zone public.org_timezone())::date;
$$;

/**
 * Builds a timestamptz for a wall-clock time on a given day, interpreted in
 * the organisation's timezone.
 *
 * `(timestamp without time zone) AT TIME ZONE tz` converts a local wall
 * clock into an absolute instant, which is exactly the intent — and is what
 * string concatenation into a timestamptz cast got wrong, because that path
 * used the session zone instead.
 */
create or replace function public.org_timestamp(p_day date, p_time text)
returns timestamptz
language sql
stable
security definer
set search_path = public
as $$
  select ((p_day::text || ' ' || coalesce(nullif(btrim(p_time), ''), '00:00'))::timestamp)
           at time zone public.org_timezone();
$$;

/** True when the given day is a working day for this organisation. */
create or replace function public.org_is_working_day(p_day date)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select extract(isodow from p_day)::smallint = any(
    coalesce((select working_days from public.org_settings where id), '{1,2,3,4,5,6}')
  );
$$;

-- Everyone signed in may read the timezone; only an owner may change it.
alter table public.org_settings enable row level security;

drop policy if exists org_settings_select on public.org_settings;
create policy org_settings_select on public.org_settings
  for select to authenticated using (true);

drop policy if exists org_settings_update_admin on public.org_settings;
create policy org_settings_update_admin on public.org_settings
  for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

grant select on public.org_settings to authenticated;
grant update on public.org_settings to authenticated;

grant execute on function public.org_timezone()               to authenticated;
grant execute on function public.org_today()                  to authenticated;
grant execute on function public.org_timestamp(date, text)    to authenticated;
grant execute on function public.org_is_working_day(date)     to authenticated;

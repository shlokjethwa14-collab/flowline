-- 0001_init — extensions, enums, tables and indexes.

create extension if not exists pgcrypto;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'user_role') then
    create type public.user_role as enum ('admin', 'employee');
  end if;
  if not exists (select 1 from pg_type where typname = 'task_status') then
    create type public.task_status as enum ('todo', 'in_progress', 'review', 'done');
  end if;
  if not exists (select 1 from pg_type where typname = 'task_type') then
    create type public.task_type as enum ('general', 'call', 'order', 'entry', 'long', 'meeting', 'growth');
  end if;
end
$$;

create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  role        public.user_role not null default 'employee',
  full_name   text not null default 'New teammate',
  job_title   text,
  reports_to  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  constraint profiles_no_self_manager check (reports_to is null or reports_to <> id)
);

create table if not exists public.task_routines (
  id                uuid primary key default gen_random_uuid(),
  title             text not null,
  task_type         public.task_type not null default 'general',
  assigned_to       uuid references public.profiles (id) on delete set null,
  created_by        uuid references public.profiles (id) on delete set null,
  due_time          text not null default '17:00',
  checklist         jsonb not null default '[]'::jsonb,
  active            boolean not null default true,
  last_generated_on date,
  created_at        timestamptz not null default now(),
  constraint task_routines_due_time_format check (due_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  constraint task_routines_checklist_is_array check (jsonb_typeof(checklist) = 'array'),
  constraint task_routines_title_not_blank check (length(btrim(title)) > 0)
);

create table if not exists public.tasks (
  id                uuid primary key default gen_random_uuid(),
  title             text not null,
  description       text,
  status            public.task_status not null default 'todo',
  assigned_to       uuid references public.profiles (id) on delete set null,
  created_by        uuid references public.profiles (id) on delete set null,
  due_date          timestamptz,
  is_blocked        boolean not null default false,
  status_changed_at timestamptz not null default now(),
  completed_at      timestamptz,
  task_type         public.task_type not null default 'general',
  checklist         jsonb not null default '[]'::jsonb,
  routine_id        uuid references public.task_routines (id) on delete set null,
  routine_on        date,
  created_at        timestamptz not null default now(),
  constraint tasks_checklist_is_array check (jsonb_typeof(checklist) = 'array'),
  constraint tasks_title_not_blank check (length(btrim(title)) > 0)
);

create table if not exists public.activity_logs (
  id         uuid primary key default gen_random_uuid(),
  task_id    uuid not null references public.tasks (id) on delete cascade,
  user_id    uuid references public.profiles (id) on delete set null,
  content    text not null,
  created_at timestamptz not null default now(),
  constraint activity_logs_content_not_blank check (length(btrim(content)) > 0)
);

create table if not exists public.task_handoffs (
  id           uuid primary key default gen_random_uuid(),
  task_id      uuid not null references public.tasks (id) on delete cascade,
  from_user_id uuid references public.profiles (id) on delete set null,
  to_user_id   uuid references public.profiles (id) on delete set null,
  note         text not null,
  created_at   timestamptz not null default now(),
  constraint task_handoffs_note_required check (length(btrim(note)) >= 10)
);

create index if not exists profiles_reports_to_idx on public.profiles (reports_to);
create index if not exists tasks_assigned_to_idx   on public.tasks (assigned_to);
create index if not exists tasks_created_by_idx    on public.tasks (created_by);
create index if not exists tasks_status_idx        on public.tasks (status);
create index if not exists tasks_due_date_idx      on public.tasks (due_date);
create index if not exists activity_task_idx       on public.activity_logs (task_id, created_at desc);
create index if not exists handoffs_task_idx       on public.task_handoffs (task_id, created_at desc);
create index if not exists handoffs_created_idx    on public.task_handoffs (created_at desc);
create index if not exists routines_assigned_idx   on public.task_routines (assigned_to);

create unique index if not exists tasks_routine_once_per_day_idx
  on public.tasks (routine_id, routine_on)
  where routine_id is not null and routine_on is not null;

-- 0006_realtime — publish the tables so every open screen stays live.

alter table public.tasks         replica identity full;
alter table public.activity_logs replica identity full;
alter table public.task_handoffs replica identity full;
alter table public.task_routines replica identity full;
alter table public.profiles      replica identity full;

do $$
declare
  t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;

  foreach t in array array['tasks', 'activity_logs', 'task_handoffs', 'task_routines', 'profiles']
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end
$$;

-- 0005_rls — Row Level Security and grants.

alter table public.profiles      enable row level security;
alter table public.tasks         enable row level security;
alter table public.activity_logs enable row level security;
alter table public.task_handoffs enable row level security;
alter table public.task_routines enable row level security;

-- profiles -------------------------------------------------------------

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated
  using (true);

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());

drop policy if exists profiles_insert_admin on public.profiles;
create policy profiles_insert_admin on public.profiles
  for insert to authenticated
  with check (public.is_admin());

drop policy if exists profiles_delete_admin on public.profiles;
create policy profiles_delete_admin on public.profiles
  for delete to authenticated
  using (public.is_admin());

-- tasks ----------------------------------------------------------------

drop policy if exists tasks_select on public.tasks;
create policy tasks_select on public.tasks
  for select to authenticated
  using (
    public.is_admin()
    or assigned_to = auth.uid()
    or created_by  = auth.uid()
  );

drop policy if exists tasks_insert_admin on public.tasks;
create policy tasks_insert_admin on public.tasks
  for insert to authenticated
  with check (public.is_admin());

drop policy if exists tasks_update on public.tasks;
create policy tasks_update on public.tasks
  for update to authenticated
  using (public.is_admin() or assigned_to = auth.uid())
  with check (public.is_admin() or assigned_to = auth.uid());

drop policy if exists tasks_delete_admin on public.tasks;
create policy tasks_delete_admin on public.tasks
  for delete to authenticated
  using (public.is_admin());

-- activity_logs --------------------------------------------------------

drop policy if exists activity_select on public.activity_logs;
create policy activity_select on public.activity_logs
  for select to authenticated
  using (public.can_see_task(task_id));

drop policy if exists activity_insert on public.activity_logs;
create policy activity_insert on public.activity_logs
  for insert to authenticated
  with check (user_id = auth.uid() and public.can_see_task(task_id));

drop policy if exists activity_update_admin on public.activity_logs;
create policy activity_update_admin on public.activity_logs
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists activity_delete_admin on public.activity_logs;
create policy activity_delete_admin on public.activity_logs
  for delete to authenticated
  using (public.is_admin());

-- task_handoffs --------------------------------------------------------

drop policy if exists handoffs_select on public.task_handoffs;
create policy handoffs_select on public.task_handoffs
  for select to authenticated
  using (
    public.is_admin()
    or from_user_id = auth.uid()
    or to_user_id   = auth.uid()
    or public.can_see_task(task_id)
  );

drop policy if exists handoffs_insert on public.task_handoffs;
create policy handoffs_insert on public.task_handoffs
  for insert to authenticated
  with check (
    public.is_admin()
    or (from_user_id = auth.uid() and public.can_see_task(task_id))
  );

drop policy if exists handoffs_delete_admin on public.task_handoffs;
create policy handoffs_delete_admin on public.task_handoffs
  for delete to authenticated
  using (public.is_admin());

-- task_routines --------------------------------------------------------

drop policy if exists routines_select on public.task_routines;
create policy routines_select on public.task_routines
  for select to authenticated
  using (public.is_admin() or assigned_to = auth.uid());

drop policy if exists routines_insert_admin on public.task_routines;
create policy routines_insert_admin on public.task_routines
  for insert to authenticated
  with check (public.is_admin());

drop policy if exists routines_update_admin on public.task_routines;
create policy routines_update_admin on public.task_routines
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists routines_delete_admin on public.task_routines;
create policy routines_delete_admin on public.task_routines
  for delete to authenticated
  using (public.is_admin());

-- grants ---------------------------------------------------------------

grant usage on schema public to anon, authenticated;

grant select, insert, update, delete on public.profiles      to authenticated;
grant select, insert, update, delete on public.tasks         to authenticated;
grant select, insert, update, delete on public.activity_logs to authenticated;
grant select, insert, delete         on public.task_handoffs to authenticated;
grant select, insert, update, delete on public.task_routines to authenticated;

grant execute on function public.is_admin()                     to authenticated;
grant execute on function public.can_see_task(uuid)             to authenticated;
grant execute on function public.handoff_task(uuid, uuid, text) to authenticated;
grant execute on function public.generate_routine_tasks(date)   to authenticated;

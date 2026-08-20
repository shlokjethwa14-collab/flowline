-- 0002_helpers — SECURITY DEFINER predicates used by the RLS policies.
-- Defining them this way keeps the profiles policies from recursing.

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

create or replace function public.can_see_task(p_task_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin()
      or exists (
           select 1 from public.tasks t
           where t.id = p_task_id
             and (t.assigned_to = auth.uid() or t.created_by = auth.uid())
         );
$$;

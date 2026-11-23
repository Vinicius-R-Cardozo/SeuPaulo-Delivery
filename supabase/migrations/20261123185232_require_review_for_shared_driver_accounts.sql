-- For a customer who applies to deliver, provisional approval cannot unlock dispatch.
create or replace function public.is_active_driver() returns boolean
language sql stable security definer set search_path='' as $$
  select exists (
    select 1
      from public.profiles p join public.drivers d on d.id=p.id
     where p.id=(select auth.uid()) and d.status='approved'
       and (p.role='driver' or (
         p.role='customer' and exists (
           select 1 from public.driver_applications a
            where a.user_id=p.id and a.status='approved' and a.admin_confirmed
         )
       ))
  )
$$;

create or replace function public.can_accept_delivery() returns boolean
language sql stable security definer set search_path='' as $$
  select public.is_active_driver() and exists (
    select 1 from public.drivers where id=(select auth.uid()) and online
  )
$$;

alter policy "apps: dono cria" on public.driver_applications with check (
  user_id=(select auth.uid()) and not admin_confirmed
  and status in ('pending_documents','under_analysis','manual_review','needs_resubmission')
);

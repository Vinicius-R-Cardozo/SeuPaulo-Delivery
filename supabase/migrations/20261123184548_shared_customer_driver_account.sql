-- Preserve the original profile role for existing sessions and admin queries.
alter table public.profiles add column customer_enabled boolean not null default false;
revoke update(customer_enabled) on public.profiles from public,anon,authenticated;

create unique index driver_applications_one_per_user on public.driver_applications(user_id);
alter table public.orders add constraint orders_driver_is_not_customer
  check (driver_id is distinct from customer_id);

create or replace function public.is_driver() returns boolean
language sql stable security definer set search_path='' as $$
  select exists (
    select 1 from public.profiles p where p.id=(select auth.uid()) and (
      p.role='driver' or (p.role='customer' and exists (
        select 1 from public.driver_applications a where a.user_id=p.id
      ))
    )
  )
$$;

create or replace function public.is_active_driver() returns boolean
language sql stable security definer set search_path='' as $$
  select public.is_driver() and exists (
    select 1 from public.drivers where id=(select auth.uid()) and status='approved'
  )
$$;

create or replace function public.can_accept_delivery() returns boolean
language sql stable security definer set search_path='' as $$
  select public.is_driver() and exists (
    select 1 from public.drivers where id=(select auth.uid()) and status='approved' and online
  )
$$;
revoke all on function public.is_driver(),public.is_active_driver(),public.can_accept_delivery() from public,anon;
grant execute on function public.is_driver(),public.is_active_driver(),public.can_accept_delivery() to authenticated;

-- Hosted checkout already calculates prices in place_order. Extend only its account gate.
do $migration$
declare
  entrypoint regprocedure := to_regprocedure('public.place_order(jsonb,text,uuid,text,text,numeric,uuid,numeric)');
  definition text;
  role_check constant text := $rule$v_prof.role <> 'customer'$rule$;
begin
  if entrypoint is null then return; end if;
  definition := pg_get_functiondef(entrypoint);
  if position(role_check in definition)=0 then raise exception 'Unexpected customer validation in place_order'; end if;
  execute replace(definition,role_check,
    $rule$not coalesce(v_prof.role='customer' or (v_prof.role='driver' and v_prof.customer_enabled),false)$rule$);
end
$migration$;

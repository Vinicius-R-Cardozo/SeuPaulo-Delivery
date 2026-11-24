-- Look at outstanding tickets only; older copies cannot raise an alert.
create index kitchen_print_outstanding_orders on kitchen_print.jobs(order_id, copy_no)
where order_id is not null and state in ('pending','reserved','sending','review');

create function public.kitchen_order_alerts()
returns table(order_id uuid, code text, kind text)
language plpgsql stable security definer set search_path='' as $$
begin
  if public.is_admin() is not true then raise insufficient_privilege; end if;
  return query
    select j.order_id, o.code::text,
      case when j.state in ('review','sending') then 'review' else 'delayed' end
    from kitchen_print.jobs j
    join public.orders o on o.id = j.order_id
    where j.order_id is not null and j.state in ('pending','reserved','sending','review')
      and o.fulfillment = 'delivery' and o.status not in ('cancelled','delivered')
      and (j.state = 'review' or (j.state = 'sending' and j.available_at <= now())
        or (j.state in ('pending','reserved') and
          (j.retrying or j.created_at <= now() - interval '30 seconds')))
      and not exists (select from kitchen_print.jobs newer
        where newer.order_id = j.order_id and newer.copy_no > j.copy_no)
    order by j.created_at, j.order_id;
end $$;

revoke all on function public.kitchen_order_alerts() from public, anon, authenticated;
grant execute on function public.kitchen_order_alerts() to authenticated;

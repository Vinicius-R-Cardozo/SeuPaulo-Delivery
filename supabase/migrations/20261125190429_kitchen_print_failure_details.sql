-- Store only known diagnostic codes from the paired agent.
alter table kitchen_print.jobs add column failure_code text
  check (failure_code in (
    'tcp_timeout','tcp_refused','tcp_unreachable','tcp_connect_failed',
    'queue_not_found','queue_access_denied','queue_unavailable','queue_paused',
    'printer_offline','paper_out','paper_jam','printer_unavailable',
    'invalid_destination','invalid_ticket','partial_write','send_failed',
    'authorization_timeout','authorization_failed'
  ));

-- The optional diagnostic keeps the two-argument RPC used by installed agents working.
drop function public.update_kitchen_ticket(uuid,text);
create function public.update_kitchen_ticket(p_lease uuid,p_action text,p_failure_code text default null) returns boolean
language plpgsql security definer set search_path='' as $$
begin
  perform kitchen_print.verify_device();
  if p_action='begin' then
    update kitchen_print.jobs set state='sending',failure_code=null,available_at=now()+interval '2 minutes'
      where lease=p_lease and state='reserved' and available_at>now();
  elsif p_action='retry' then
    update kitchen_print.jobs set state='pending',retrying=true,lease=null,failure_code=p_failure_code,
      available_at=now()+interval '10 seconds'
      where lease=p_lease and state='reserved';
  elsif p_action in ('sent','review') then
    update kitchen_print.jobs set state=p_action,lease=null,
      failure_code=case when p_action='review' then p_failure_code end
      where lease=p_lease and state='sending';
  else
    raise exception 'Ação inválida';
  end if;
  return found;
end $$;
revoke all on function public.update_kitchen_ticket(uuid,text,text) from public,anon,authenticated;
grant execute on function public.update_kitchen_ticket(uuid,text,text) to anon;

create or replace function public.kitchen_ticket_status(p_order uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare job kitchen_print.jobs;
begin
  if public.is_admin() is not true then raise insufficient_privilege; end if;
  select * into job from kitchen_print.jobs where order_id=p_order order by copy_no desc limit 1;
  if not found then return null; end if;
  return jsonb_build_object('id',job.id,'copy',job.copy_no,'failure_code',case
      when job.state='sending' and job.available_at<=now() then 'confirmation_timeout'
      when job.state='review' or (job.retrying and job.state in ('pending','reserved')) then job.failure_code
    end,'state',case
    when job.state='sending' and job.available_at<=now() then 'review'
    when job.retrying and job.state in ('pending','reserved') then 'retry'
    else job.state end);
end $$;

create or replace function public.kitchen_printer_settings(p_access text) returns jsonb language plpgsql stable
security definer set search_path='' as $$
declare d kitchen_print.device; t kitchen_print.jobs;
begin
  perform kitchen_print.require_admin(p_access);
  select * into d from kitchen_print.device;
  select * into t from kitchen_print.jobs where order_id is null order by created_at desc limit 1;
  return jsonb_build_object('paired',d.singleton is true,'managed',coalesce(d.managed,false),
    'enabled',coalesce(d.enabled,false),'destination',d.destination,'machine',d.machine,'last_seen',d.last_seen,
    'online',coalesce(d.last_seen > now()-interval '45 seconds',false),'queues',coalesce(d.queues,'{}'::text[]),
    'test',case when t.id is not null then jsonb_build_object('id',t.id,'at',t.created_at,'destination',t.ticket->'destination',
      'failure_code',case
      when t.state='sending' and t.available_at<=now() then 'confirmation_timeout'
      when t.state='review' or (t.retrying and t.state in ('pending','reserved')) then t.failure_code
    end,'state',case
      when t.state='sending' and t.available_at<=now() then 'review'
      when t.retrying and t.state in ('pending','reserved') then 'retry' else t.state end) end);
end $$;

drop function public.kitchen_order_alerts();
create function public.kitchen_order_alerts()
returns table(order_id uuid, code text, kind text, failure_code text)
language plpgsql stable security definer set search_path='' as $$
begin
  if public.is_admin() is not true then raise insufficient_privilege; end if;
  return query
    select j.order_id, o.code::text,
      case when j.state in ('review','sending') then 'review' else 'delayed' end,
      case
      when j.state='sending' and j.available_at<=now() then 'confirmation_timeout'
      when j.state='review' or (j.retrying and j.state in ('pending','reserved')) then j.failure_code
    end
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
revoke all on function public.kitchen_order_alerts() from public,anon,authenticated;
grant execute on function public.kitchen_order_alerts() to authenticated;

notify pgrst, 'reload schema';

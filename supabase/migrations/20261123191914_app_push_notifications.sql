create table order_live.push_devices (
  id uuid primary key default gen_random_uuid(),
  installation uuid not null unique,
  user_id uuid not null references public.profiles(id) on delete cascade,
  platform text not null check (platform in ('android','ios','ios-sandbox')),
  token text not null,
  unique (platform, token)
);
alter table order_live.push_devices enable row level security;
create index push_devices_user_idx on order_live.push_devices(user_id);

create table order_live.push_queue (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references order_live.push_devices on delete cascade,
  dedup_key text not null,
  title text not null,
  body text not null,
  route text not null,
  offer_order uuid references public.orders on delete cascade,
  expires_at timestamptz not null,
  next_attempt timestamptz not null default now(),
  lease uuid,
  unique(device_id,dedup_key)
);
alter table order_live.push_queue enable row level security;
create index push_queue_ready_idx on order_live.push_queue(next_attempt);
create index push_queue_expires_idx on order_live.push_queue(expires_at);
create index push_queue_lease_idx on order_live.push_queue(lease) where lease is not null;

create function public.register_app_push(p_installation uuid,p_platform text,p_token text) returns void
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();
begin
  if actor is null or p_installation is null or p_token is null or length(p_token) not between 16 and 4096
     or p_platform is null or p_platform not in ('android','ios','ios-sandbox') then
    raise exception 'Registro de notificações inválido';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_platform||':'||p_token,12));
  perform pg_advisory_xact_lock(hashtextextended(p_installation::text,11));
  if exists(select 1 from order_live.push_devices where installation=p_installation and user_id=actor
    and platform=p_platform and token=p_token) then return; end if;
  -- Replacing the device row also discards the previous registration's queued events.
  delete from order_live.push_devices where installation=p_installation or (platform=p_platform and token=p_token);
  insert into order_live.push_devices(installation,user_id,platform,token)
    values(p_installation,actor,p_platform,p_token);
end $$;

create function public.unregister_app_push(p_installation uuid) returns void
language sql security definer set search_path='' as $$
 delete from order_live.push_devices where installation=p_installation and user_id=(select auth.uid())
$$;

create function order_live.enqueue_push(recipient uuid, key text, title text, body text, route text, offer uuid default null)
returns void language sql set search_path='' as $$
 insert into order_live.push_queue (device_id,dedup_key,title,body,route,offer_order,expires_at)
 select d.id,key,title,body,route,offer,now()+case when offer is null then interval '12 hours' else interval '2 minutes' end
 from order_live.push_devices d where d.user_id=recipient on conflict(device_id,dedup_key) do nothing
$$;

create function order_live.can_receive_offer(o public.orders, recipient uuid) returns boolean
language sql stable set search_path='' as $$
 select o.fulfillment='delivery' and o.driver_id is null and o.status in ('confirmed','preparing','ready')
   and o.customer_id<>recipient and exists (
   select 1 from public.drivers d join public.profiles p on p.id=d.id
   where d.id=recipient and d.status='approved' and d.online
     and (p.role='driver' or (p.role='customer' and exists (
       select 1 from public.driver_applications a
       where a.user_id=p.id and a.status='approved' and a.admin_confirmed
     )))
   and not exists(select 1 from public.orders active
     where active.driver_id=recipient and active.status not in ('delivered','cancelled')))
$$;

create function order_live.notify_order_push() returns trigger
language plpgsql security definer set search_path='' as $$
declare
  event_key text:=new.id||':'||new.status;
  customer_title text;
  driver_title text;
  recipient record;
begin
  if tg_op='UPDATE' and new.status=old.status and new.driver_id is not distinct from old.driver_id then return null; end if;
  if tg_op='INSERT' or new.status is distinct from old.status then
    customer_title:=order_live.snapshot(new)->>'title';
    if customer_title is not null then
      perform order_live.enqueue_push(new.customer_id,event_key||':buyer',customer_title,
        'Acompanhe seu pedido no Seu Paulo.','/app/pedido/'||new.id);
    end if;
  end if;
  if tg_op='UPDATE' and new.driver_id is distinct from old.driver_id and new.driver_id is not null then
    perform order_live.enqueue_push(new.driver_id,new.id||':assigned','Entrega atribuída',
      'Abra o app para consultar sua entrega.','/entregador/entrega/'||new.id);
  elsif new.driver_id is not null then
    driver_title:=case new.status
      when 'confirmed' then 'Pedido confirmado' when 'preparing' then 'Pedido em preparo'
      when 'ready' then 'Pedido pronto para retirada' when 'at_restaurant' then 'Chegada à loja registrada'
      when 'on_the_way' then 'Entrega iniciada' when 'arrived' then 'Chegada ao cliente registrada'
      when 'delivered' then 'Entrega concluída' when 'cancelled' then 'Entrega cancelada' end;
    if driver_title is not null then
      perform order_live.enqueue_push(new.driver_id,event_key||':courier',driver_title,
        'Confira a atualização no app de entregador.',
        case when new.status in ('cancelled','delivered') then '/entregador/historico' else '/entregador/entrega/'||new.id end);
    end if;
  end if;
  if new.status in ('confirmed','preparing','ready') and new.driver_id is null and new.fulfillment='delivery'
     and (tg_op='INSERT' or old.status not in ('confirmed','preparing','ready') or old.driver_id is not null) then
    for recipient in select distinct d.user_id from order_live.push_devices d
      where order_live.can_receive_offer(new,d.user_id)
    loop
      perform order_live.enqueue_push(recipient.user_id,new.id||':offer','Nova entrega disponível',
        'Abra o painel do entregador para ver a oferta.','/entregador',new.id);
    end loop;
  end if;
  return null;
end $$;
create trigger app_push_order after insert or update of status,driver_id on public.orders
for each row execute function order_live.notify_order_push();

create function order_live.notify_driver_application_push() returns trigger
language plpgsql security definer set search_path='' as $$
declare title text;
begin
 if tg_op='INSERT' then title:='Cadastro de entregador recebido';
 elsif new.status='approved' and new.admin_confirmed and not (old.status='approved' and old.admin_confirmed) then
   title:='Cadastro de entregador aprovado';
 elsif new.status is distinct from old.status then
   title:=case new.status when 'rejected' then 'Cadastro de entregador reprovado'
     when 'needs_resubmission' then 'Atualize seu cadastro de entregador'
     when 'manual_review' then 'Cadastro de entregador em análise' end;
 end if;
 if title is not null then
   perform order_live.enqueue_push(new.user_id,new.id||':'||title||':'||txid_current()::text,
     title,'Confira a situação no painel do entregador.','/entregador');
 end if;
 return null;
end $$;
create trigger app_push_driver_application after insert or update of status,admin_confirmed on public.driver_applications
for each row execute function order_live.notify_driver_application_push();

create function order_live.notify_driver_access_push() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 perform order_live.enqueue_push(new.id,new.id||':access:'||new.status||':'||txid_current()::text,
   case when new.status='blocked' then 'Acesso às entregas suspenso' else 'Acesso às entregas reativado' end,
   'Confira a situação no painel do entregador.','/entregador');
 return null;
end $$;

create trigger app_push_driver_access after update of status on public.drivers
for each row when (old.status is distinct from new.status and (new.status='blocked' or (old.status='blocked' and new.status='approved')))
execute function order_live.notify_driver_access_push();

create function public.claim_app_push() returns table(lease uuid,platform text,token text,title text,body text,route text,event_id uuid,expires_at timestamptz)
language plpgsql security definer set search_path='' as $$
begin
  delete from order_live.push_queue q where q.expires_at<=now();
  return query
  with batch as (
   select q.id from order_live.push_queue q join order_live.push_devices d on d.id=q.device_id
   left join public.orders o on o.id=q.offer_order
   where q.next_attempt<=now()
     and (q.offer_order is null or order_live.can_receive_offer(o,d.user_id))
   order by q.next_attempt,q.id limit 50 for update of q skip locked
  ), claimed as (
   update order_live.push_queue q set lease=gen_random_uuid(),next_attempt=now()+interval '90 seconds'
   from batch b where q.id=b.id returning q.*
  )
  select c.lease,d.platform,d.token,c.title,c.body,c.route,c.id,c.expires_at
  from claimed c join order_live.push_devices d on d.id=c.device_id;
end $$;

create function public.finish_app_push(p_lease uuid,p_result text) returns void
language plpgsql security definer set search_path='' as $$
begin
  if p_result='invalid' then
    delete from order_live.push_devices d using order_live.push_queue q
    where q.device_id=d.id and q.lease=p_lease;
  elsif p_result='sent' then
    delete from order_live.push_queue where lease=p_lease;
  else
    update order_live.push_queue set lease=null,next_attempt=now()+interval '1 minute' where lease=p_lease;
  end if;
end $$;

revoke all on function public.register_app_push(uuid,text,text),public.unregister_app_push(uuid),
  public.claim_app_push(),public.finish_app_push(uuid,text) from public,anon,authenticated;
grant execute on function public.register_app_push(uuid,text,text),public.unregister_app_push(uuid) to authenticated;
grant execute on function public.claim_app_push(),public.finish_app_push(uuid,text) to service_role;

create or replace function order_live.dispatch() returns void language plpgsql security definer set search_path='' as $$
declare endpoint text; secret text;
begin
  if not exists(select 1 from order_live.devices where pending and next_attempt<=now())
     and not exists(select 1 from order_live.push_queue where next_attempt<=now() or expires_at<=now()) then return; end if;
  select decrypted_secret into endpoint from vault.decrypted_secrets where name='order_live_worker_url';
  select decrypted_secret into secret from vault.decrypted_secrets where name='order_live_worker_secret';
  if endpoint is not null and secret is not null then
    perform net.http_post(url:=endpoint,headers:=jsonb_build_object('x-order-live-secret',secret),body:='{}'::jsonb);
  end if;
end $$;

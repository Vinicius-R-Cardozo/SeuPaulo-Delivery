create schema if not exists order_live;
revoke all on schema order_live from public, anon, authenticated;

-- One pending snapshot per order and installation. GPS updates with the same ETA
-- do not wake the worker. A new snapshot supersedes unsent intermediate steps.
create table order_live.devices (
  order_id uuid not null references public.orders(id) on delete cascade,
  installation uuid not null,
  platform text not null check (platform in ('android','ios','ios-sandbox')),
  token text not null,
  state jsonb not null,
  revision bigint not null,
  pending boolean not null default true,
  next_attempt timestamptz not null default now(),
  lease uuid,
  primary key (order_id, installation)
);
alter table order_live.devices enable row level security;
create index devices_pending on order_live.devices(next_attempt) where pending;

create function order_live.snapshot(o public.orders) returns jsonb
language plpgsql stable set search_path = '' as $$
declare
  eta integer;
  step integer;
  title text;
  lat double precision;
  lng double precision;
begin
  select v.label, v.stage into title, step from (values
    ('received','Pedido recebido',1), ('confirmed','Restaurante confirmou',2),
    ('preparing','Em preparo',3), ('ready',case when o.fulfillment='pickup' then 'Pronto para retirada' else 'Pronto para entrega' end,4),
    ('accepted','Entregador indo ao restaurante',3), ('at_restaurant','Entregador no restaurante',4),
    ('on_the_way','Saiu para entrega',5), ('arrived','Entregador chegou',6),
    ('delivered',case when o.fulfillment='pickup' then 'Pedido retirado' else 'Pedido entregue' end,7),
    ('cancelled','Pedido cancelado',0)
  ) v(status,label,stage) where v.status=o.status;
  if o.status='on_the_way' and o.driver_lat is not null and o.driver_lng is not null
     and jsonb_typeof(o.address->'lat')='number' and jsonb_typeof(o.address->'lng')='number' then
    lat := (o.address->>'lat')::double precision;
    lng := (o.address->>'lng')::double precision;
    eta := greatest(1, ceil(2*6371*asin(sqrt(least(1,
      sin(radians(lat-o.driver_lat)/2)^2 + cos(radians(lat))*cos(radians(o.driver_lat))*sin(radians(lng-o.driver_lng)/2)^2
    )))*60/22)::integer);
  elsif o.fulfillment='delivery' and o.status not in ('on_the_way','arrived','delivered','cancelled') then
    eta := o.eta_minutes;
  end if;
  return jsonb_build_object('orderId',o.id,'code',o.code,'title',title,'step',step,
    'total',case when o.fulfillment='pickup' then 5 else 7 end,
    'progress',case when o.fulfillment='pickup' and o.status='delivered' then 5 else step end,
    'eta',eta,'terminal',o.status in ('delivered','cancelled'));
end $$;

create function public.customer_live_orders(p_known uuid[] default '{}') returns setof jsonb
language sql stable security definer set search_path = '' as $$
  select order_live.snapshot(o) || jsonb_build_object('revision',floor(extract(epoch from o.updated_at)*1000)::bigint)
  from public.orders o where o.customer_id=(select auth.uid())
    and (o.status not in ('delivered','cancelled') or o.id=any(p_known))
$$;

create function public.register_order_live(p_order uuid,p_installation uuid,p_platform text,p_token text)
returns void language plpgsql security definer set search_path = '' as $$
declare o public.orders;
begin
  if p_token is null or length(p_token) not between 16 and 4096 or p_platform not in ('android','ios','ios-sandbox')
    then raise exception 'Registro inválido'; end if;
  select * into o from public.orders where id=p_order and customer_id=(select auth.uid()) for share;
  if not found then raise exception 'Pedido indisponível'; end if;
  insert into order_live.devices as d(order_id,installation,platform,token,state,revision)
    values(o.id,p_installation,p_platform,p_token,order_live.snapshot(o),floor(extract(epoch from o.updated_at)*1000)::bigint)
    on conflict(order_id,installation) do update set token=excluded.token, platform=excluded.platform,
      state=excluded.state, revision=excluded.revision, pending=true, next_attempt=now(), lease=null
      where (d.token,d.platform) is distinct from (excluded.token,excluded.platform);
end $$;

create function public.unregister_order_live(p_installation uuid) returns void
language sql security definer set search_path = '' as $$
  delete from order_live.devices d using public.orders o where d.order_id=o.id
    and d.installation=p_installation and o.customer_id=(select auth.uid())
$$;

create function order_live.queue_change() returns trigger language plpgsql security definer set search_path = '' as $$
declare snapshot jsonb;
begin
  if exists(select 1 from order_live.devices where order_id=new.id) then
    snapshot := order_live.snapshot(new);
    update order_live.devices set state=snapshot, revision=greatest(revision+1,floor(extract(epoch from new.updated_at)*1000)::bigint),
      pending=true, next_attempt=case when lease is null then now() else next_attempt end
      where order_id=new.id and state is distinct from snapshot;
  end if;
  return null;
end $$;
create trigger queue_order_live after update of status,driver_lat,driver_lng,eta_minutes on public.orders
for each row execute function order_live.queue_change();

create function public.claim_order_live() returns table(order_id uuid,installation uuid,platform text,token text,state jsonb,revision bigint,lease uuid)
language sql security definer set search_path = '' as $$
  with batch as (
    select d.order_id,d.installation from order_live.devices d where d.pending and d.next_attempt<=now()
    order by d.next_attempt limit 50 for update skip locked
  ) update order_live.devices d set lease=gen_random_uuid(),next_attempt=now()+interval '90 seconds'
    from batch b where (d.order_id,d.installation)=(b.order_id,b.installation)
    returning d.order_id,d.installation,d.platform,d.token,d.state,d.revision,d.lease
$$;

create function public.finish_order_live(p_lease uuid,p_revision bigint,p_result text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_result='invalid' then
    delete from order_live.devices where lease=p_lease;
  elsif p_result='sent' then
    delete from order_live.devices where lease=p_lease and revision=p_revision and (state->>'terminal')::boolean;
    update order_live.devices set pending=revision<>p_revision, lease=null,next_attempt=now() where lease=p_lease;
  else
    update order_live.devices set lease=null,next_attempt=now()+interval '1 minute' where lease=p_lease;
  end if;
end $$;
create index devices_lease on order_live.devices(lease) where lease is not null;

revoke all on function public.customer_live_orders(uuid[]), public.register_order_live(uuid,uuid,text,text),
  public.unregister_order_live(uuid), public.claim_order_live(), public.finish_order_live(uuid,bigint,text) from public,anon,authenticated;
grant execute on function public.customer_live_orders(uuid[]), public.register_order_live(uuid,uuid,text,text),
  public.unregister_order_live(uuid) to authenticated;
grant execute on function public.claim_order_live(),public.finish_order_live(uuid,bigint,text) to service_role;


-- FCM may rotate the token while the WebView is suspended. Rotation requires
-- both the previous provider token and the installation's random identifier.
create function public.rotate_order_live_android(p_installation uuid,p_old text,p_new text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_new is null or length(p_new) not between 16 and 4096 or p_old = p_new then return; end if;
  update order_live.devices set token=p_new, lease=null,pending=true,next_attempt=now()
    where installation=p_installation and platform='android' and token=p_old;
end $$;
create index devices_android_installation on order_live.devices(installation) where platform='android';
revoke all on function public.rotate_order_live_android(uuid,text,text) from public;
grant execute on function public.rotate_order_live_android(uuid,text,text) to anon,authenticated;

create extension if not exists pg_cron;
create extension if not exists pg_net;
create extension if not exists supabase_vault;
create function order_live.dispatch() returns void language plpgsql security definer set search_path = '' as $$
declare endpoint text; secret text;
begin
  if not exists(select 1 from order_live.devices where pending and next_attempt<=now()) then return; end if;
  select decrypted_secret into endpoint from vault.decrypted_secrets where name='order_live_worker_url';
  select decrypted_secret into secret from vault.decrypted_secrets where name='order_live_worker_secret';
  if endpoint is not null and secret is not null then
    perform net.http_post(url:=endpoint,headers:=jsonb_build_object('x-order-live-secret',secret),body:='{}'::jsonb);
  end if;
end $$;
select cron.schedule('seu-paulo-order-live','10 seconds','select order_live.dispatch()');

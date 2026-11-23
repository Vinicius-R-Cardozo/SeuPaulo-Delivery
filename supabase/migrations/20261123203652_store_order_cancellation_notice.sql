-- Identifica cancelamentos da loja no histórico, no sino do app e no push.

create or replace function public.advance_order(p_order_id uuid, p_status text, p_note text default null)
returns public.orders language plpgsql security definer set search_path='' as $$
declare o public.orders; actor uuid := auth.uid(); allowed boolean := false; store_cancel boolean := false;
begin
 if actor is null then raise exception 'Entre novamente.'; end if;
 if p_status='accepted' then
   perform 1 from public.drivers where id=actor and status='approved' and online for update;
   if not found or not public.can_accept_delivery() then raise exception 'Fique online com um cadastro aprovado para aceitar.'; end if;
 end if;
 select * into strict o from public.orders where id=p_order_id for update;
 if p_status='accepted' and o.fulfillment='delivery' then
   if o.status='accepted' and o.driver_id=actor then return o; end if;
   allowed := o.driver_id is null and o.status in ('confirmed','preparing','ready') and not exists
     (select 1 from public.orders where driver_id=actor and status not in ('delivered','cancelled'));
 elsif p_status='cancelled' then
   store_cancel := public.is_admin();
   if store_cancel then p_note := nullif(left(btrim(p_note),240),''); end if;
   allowed := (store_cancel or (actor=o.customer_id and o.status='received'))
       and o.status not in ('delivered','cancelled');
 elsif public.is_admin() then
   allowed := (p_status='confirmed' and o.status='received') or (o.fulfillment='pickup' and
     ((p_status='preparing' and o.status='confirmed') or (p_status='ready' and o.status='preparing')
     or (p_status='delivered' and o.status='ready')));
 elsif o.driver_id=actor and o.fulfillment='delivery' then
   if p_status=o.status and p_status in ('at_restaurant','on_the_way','arrived') then return o; end if;
   allowed := (p_status='at_restaurant' and o.status in ('accepted','confirmed','preparing','ready'))
       or (p_status='on_the_way' and o.status='at_restaurant')
       or (p_status='arrived' and o.status='on_the_way');
 end if;
 if allowed is not true then raise exception 'Esta etapa não está disponível para você neste pedido.'; end if;
 perform set_config('app.order_rpc','on',true);
 if p_status='delivered' then perform set_config('app.confirm_delivery','on',true); end if;
 update public.orders set status=p_status, driver_id=case when p_status='accepted' then actor else driver_id end,
   status_history=status_history || jsonb_strip_nulls(jsonb_build_object(
     'status',p_status,'at',now(),'note',p_note,'cancelledBy',case when store_cancel then 'store' end)),
   updated_at=now(), delivered_at=case when p_status='delivered' then now() else delivered_at end,
   payment_status=case when p_status='delivered' then 'approved' else payment_status end,
   eta_minutes=case when p_status='delivered' then 0 else eta_minutes end
 where id=o.id returning * into o;
 return o;
end $$;

create or replace function public.notify_order_update()
returns trigger language plpgsql security definer set search_path = public as $$
declare msg text;
begin
  -- entregador atribuído
  if new.driver_id is distinct from old.driver_id and new.driver_id is not null then
    insert into public.notifications(user_id, audience, title, body, order_id, read)
    values (new.customer_id, 'customer', 'Pedido ' || new.code,
            'Seu pedido foi aceito por um entregador 🛵', new.id, false);
  end if;

  -- mudança de status
  if new.status is distinct from old.status then
    msg := case new.status
      when 'confirmed'  then 'Seu pedido foi confirmado! 🍻'
      when 'preparing'  then 'A cozinha já está no fogo 👨‍🍳'
      when 'ready'      then 'Pedido pronto! Já já sai pra entrega 📦'
      when 'on_the_way' then 'Seu pedido está a caminho 🛵'
      when 'arrived'    then 'O entregador chegou. Informe o código de entrega. 🔔'
      when 'delivered'  then 'Pedido entregue com sucesso ✅'
      when 'cancelled' then case when new.status_history->-1->>'cancelledBy'='store'
        then concat_ws(' ', 'A loja cancelou seu pedido.',
          nullif(new.status_history->-1->>'note','Cancelado pela administração'))
        else 'Seu pedido foi cancelado.' end
      else null end;
    if msg is not null then
      insert into public.notifications(user_id, audience, title, body, order_id, read)
      values (new.customer_id, 'customer', 'Pedido ' || new.code, msg, new.id, false);
    end if;
  end if;
  return new;
end; $$;

create or replace function order_live.snapshot(o public.orders) returns jsonb
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
    ('cancelled',case when o.status_history->-1->>'cancelledBy'='store'
       then 'A loja cancelou seu pedido' else 'Pedido cancelado' end,0)
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

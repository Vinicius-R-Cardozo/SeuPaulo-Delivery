-- Dispatch is serialized on the driver and the order. Only RPCs change an order after creation.
alter table public.orders drop constraint orders_status_check;
alter table public.orders add constraint orders_status_check check (status in
 ('received','confirmed','preparing','ready','accepted','at_restaurant','on_the_way','arrived','delivered','cancelled'));
alter table public.orders add column driver_location_at timestamptz;
create index orders_open_driver_idx on public.orders(driver_id)
 where driver_id is not null and status not in ('delivered','cancelled');

drop policy "orders: leitura por papel" on public.orders;
create policy "Read owned orders and available trips" on public.orders for select to authenticated using (
 customer_id = (select auth.uid()) or public.is_admin() or driver_id = (select auth.uid())
 or (driver_id is null and fulfillment='delivery' and status in ('confirmed','preparing','ready')
 and exists (select 1 from public.drivers d where d.id=(select auth.uid()) and d.status='approved' and d.online)));
drop policy "orders: cliente cria o próprio" on public.orders;
create policy "Create initial order" on public.orders for insert to authenticated with check (
 customer_id=(select auth.uid()) and status='received' and driver_id is null and delivered_at is null
 and payment_status='pending' and driver_lat is null and driver_lng is null and driver_location_at is null);
revoke update on public.orders from public,anon,authenticated;

-- This capability can only post a position for one currently dispatched trip.
create table public.delivery_tracking_keys (
 order_id uuid primary key references public.orders on delete cascade,
 ticket uuid not null default gen_random_uuid()
);
alter table public.delivery_tracking_keys enable row level security;
revoke all on public.delivery_tracking_keys from public,anon,authenticated;

create function public.advance_order(p_order_id uuid, p_status text, p_note text default null)
returns public.orders language plpgsql security definer set search_path='' as $$
declare o public.orders; actor uuid := auth.uid(); allowed boolean := false;
begin
 if actor is null then raise exception 'Entre novamente.'; end if;
 if p_status='accepted' then
   perform 1 from public.drivers where id=actor and status='approved' and online for update;
   if not found then raise exception 'Fique online com um cadastro aprovado para aceitar.'; end if;
 end if;
 select * into strict o from public.orders where id=p_order_id for update;
 if p_status='accepted' and o.fulfillment='delivery' then
   if o.status='accepted' and o.driver_id=actor then return o; end if;
   allowed := o.driver_id is null and o.status in ('confirmed','preparing','ready') and not exists
     (select 1 from public.orders where driver_id=actor and status not in ('delivered','cancelled'));
 elsif p_status='cancelled' then
   allowed := (public.is_admin() or (actor=o.customer_id and o.status='received'))
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
 if p_status='delivered' then perform set_config('app.confirm_delivery','on',true); end if;
 update public.orders set status=p_status, driver_id=case when p_status='accepted' then actor else driver_id end,
   status_history=status_history || jsonb_strip_nulls(jsonb_build_object('status',p_status,'at',now(),'note',p_note)),
   updated_at=now(), delivered_at=case when p_status='delivered' then now() else delivered_at end,
   payment_status=case when p_status='delivered' then 'approved' else payment_status end,
   eta_minutes=case when p_status='delivered' then 0 else eta_minutes end
 where id=o.id returning * into o;
 return o;
end $$;
revoke all on function public.advance_order(uuid,text,text) from public,anon;
grant execute on function public.advance_order(uuid,text,text) to authenticated;

create function public.delivery_tracking_ticket(p_order_id uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare result uuid;
begin
 perform 1 from public.orders where id=p_order_id and driver_id=auth.uid() and status='on_the_way' for update;
 if not found then raise exception 'Entrega inativa.'; end if;
 insert into public.delivery_tracking_keys(order_id) values(p_order_id) on conflict do nothing;
 select ticket into strict result from public.delivery_tracking_keys where order_id=p_order_id;
 return result;
end $$;
revoke all on function public.delivery_tracking_ticket(uuid) from public,anon;
grant execute on function public.delivery_tracking_ticket(uuid) to authenticated;

-- Return false only when the client must stop. Discard delayed/duplicate fixes.
create function public.report_delivery_location(p_order_id uuid,p_ticket uuid,p_lat float8,p_lng float8,p_at timestamptz)
returns boolean language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.delivery_tracking_keys k join public.orders o on o.id=k.order_id
   where k.order_id=p_order_id and k.ticket=p_ticket and o.status='on_the_way') then return false; end if;
 if p_lat between -90 and 90 and p_lng between -180 and 180 and p_at between now()-interval '2 minutes' and now()+interval '10 seconds' then
   update public.orders set driver_lat=p_lat,driver_lng=p_lng,driver_location_at=p_at,updated_at=clock_timestamp()
     where id=p_order_id and status='on_the_way' and (driver_location_at is null or driver_location_at<p_at);
 end if;
 return true;
end $$;
revoke all on function public.report_delivery_location(uuid,uuid,float8,float8,timestamptz) from public;
grant execute on function public.report_delivery_location(uuid,uuid,float8,float8,timestamptz) to anon,authenticated;

create function public.stop_delivery_tracking() returns trigger language plpgsql security definer set search_path='' as $$
begin
 delete from public.delivery_tracking_keys where order_id=new.id;
 return new;
end $$;
revoke all on function public.stop_delivery_tracking() from public,anon,authenticated;
create trigger stop_delivery_tracking after update of status on public.orders for each row
 when (old.status='on_the_way' and new.status<>'on_the_way') execute function public.stop_delivery_tracking();

create or replace function public.confirm_delivery(p_order_id uuid,p_code text)
returns json language plpgsql security definer set search_path='' as $$
declare o public.orders;
begin
 select * into o from public.orders where id=p_order_id and driver_id=auth.uid() and fulfillment='delivery' for update;
 if not found then return json_build_object('ok',false,'error','Entrega não encontrada.'); end if;
 if o.status='delivered' then return json_build_object('ok',true); end if;
 if o.status<>'arrived' then return json_build_object('ok',false,'error','Confirme a chegada ao cliente primeiro.'); end if;
 update public.order_delivery_codes set used=true,used_at=now()
   where order_id=o.id and not used and code=p_code;
 if not found then return json_build_object('ok',false,'error','Código de entrega inválido.'); end if;
 perform set_config('app.confirm_delivery','on',true);
 update public.orders set status='delivered', delivered_at=now(),payment_status='approved',eta_minutes=0,updated_at=now(),
   status_history=status_history || jsonb_build_object('status','delivered','at',now()) where id=o.id;
 update public.drivers set total_deliveries=total_deliveries+1 where id=o.driver_id;
 return json_build_object('ok',true);
end $$;

-- Roles and approval used by dispatch must be assigned by the backend.
revoke update on public.profiles from public,anon,authenticated;
grant update(full_name,phone,avatar_url) on public.profiles to authenticated;
create or replace function public.handle_new_user() returns trigger language plpgsql
security definer set search_path='' as $$
begin
 insert into public.profiles(id,role,full_name,email,phone) values
 (new.id,case when new.raw_user_meta_data->>'role'='driver' then 'driver' else 'customer' end,
 coalesce(new.raw_user_meta_data->>'full_name','Cliente'),new.email,new.raw_user_meta_data->>'phone')
 on conflict(id) do nothing;
 return new;
end $$;
drop policy if exists "drivers: self insere (no cadastro)" on public.drivers;
create policy "drivers: self insere (no cadastro)" on public.drivers for insert to authenticated
 with check (id=(select auth.uid()) and status='pending');

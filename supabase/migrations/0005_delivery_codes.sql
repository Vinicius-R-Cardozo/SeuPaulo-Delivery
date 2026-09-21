-- ============================================================
-- Sistema de acompanhamento: código de entrega + confirmação segura +
-- notificações automáticas. Rode no SQL Editor do Supabase (após os anteriores).
-- Idempotente o suficiente para rodar novamente.
-- ============================================================

-- 1) Novo status 'arrived' (motorista chegou / aguardando código) + delivered_at
alter table public.orders drop constraint if exists orders_status_check;
alter table public.orders add constraint orders_status_check
  check (status in ('received','confirmed','preparing','ready','on_the_way','arrived','delivered','cancelled'));
alter table public.orders add column if not exists delivered_at timestamptz;

-- 2) Código de entrega em tabela separada (o motorista NUNCA lê; só o cliente/admin)
create table if not exists public.order_delivery_codes (
  order_id uuid primary key references public.orders(id) on delete cascade,
  code text not null,
  used boolean not null default false,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.order_delivery_codes enable row level security;

drop policy if exists "delivery_codes: cliente/admin leem" on public.order_delivery_codes;
create policy "delivery_codes: cliente/admin leem" on public.order_delivery_codes
  for select using (
    public.is_admin()
    or exists (select 1 from public.orders o where o.id = order_id and o.customer_id = auth.uid())
  );
-- Sem policies de insert/update/delete: gerenciado só por triggers/RPC (SECURITY DEFINER).

-- 3) Gera um código de 6 dígitos ao criar o pedido
create or replace function public.gen_delivery_code()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.order_delivery_codes(order_id, code)
  values (new.id, lpad((floor(random() * 1000000))::int::text, 6, '0'))
  on conflict (order_id) do nothing;
  return new;
end; $$;
drop trigger if exists trg_gen_delivery_code on public.orders;
create trigger trg_gen_delivery_code after insert on public.orders
  for each row execute function public.gen_delivery_code();

-- 4) Impede mudar o status para 'delivered' fora do fluxo de confirmação
create or replace function public.guard_delivered()
returns trigger language plpgsql as $$
begin
  if new.status = 'delivered' and coalesce(old.status, '') <> 'delivered'
     and current_setting('app.confirm_delivery', true) is distinct from 'on' then
    raise exception 'Entrega só pode ser confirmada com o código do cliente.';
  end if;
  return new;
end; $$;
drop trigger if exists trg_guard_delivered on public.orders;
create trigger trg_guard_delivered before update on public.orders
  for each row execute function public.guard_delivered();

-- 5) RPC de confirmação de entrega (validação 100% no backend)
create or replace function public.confirm_delivery(p_order_id uuid, p_code text)
returns json language plpgsql security definer set search_path = public as $$
declare
  o public.orders;
  c public.order_delivery_codes;
  informado text;
begin
  select * into o from public.orders where id = p_order_id;
  if not found then
    return json_build_object('ok', false, 'error', 'Pedido não encontrado.');
  end if;
  -- motorista autenticado precisa ser o atribuído ao pedido
  if o.driver_id is null or o.driver_id <> auth.uid() then
    return json_build_object('ok', false, 'error', 'Você não é o entregador deste pedido.');
  end if;
  if o.status = 'delivered' then
    return json_build_object('ok', false, 'error', 'Pedido já foi entregue.');
  end if;
  -- status precisa permitir entrega
  if o.status not in ('on_the_way', 'arrived') then
    return json_build_object('ok', false, 'error', 'O pedido ainda não está em entrega.');
  end if;
  select * into c from public.order_delivery_codes where order_id = p_order_id;
  if not found or c.used then
    return json_build_object('ok', false, 'error', 'Código indisponível para este pedido.');
  end if;
  informado := regexp_replace(coalesce(p_code, ''), '\D', '', 'g');
  if c.code <> informado then
    return json_build_object('ok', false, 'error', 'Código de entrega inválido.');
  end if;

  -- tudo certo: libera o guard e marca como entregue
  perform set_config('app.confirm_delivery', 'on', true);
  update public.orders
     set status = 'delivered',
         delivered_at = now(),
         payment_status = 'approved',
         eta_minutes = 0,
         updated_at = now(),
         status_history = coalesce(status_history, '[]'::jsonb)
                          || jsonb_build_object('status', 'delivered', 'at', now())
   where id = p_order_id;
  update public.order_delivery_codes set used = true, used_at = now() where order_id = p_order_id;
  update public.drivers set total_deliveries = total_deliveries + 1 where id = o.driver_id;

  return json_build_object('ok', true);
end; $$;
revoke all on function public.confirm_delivery(uuid, text) from public, anon;
grant execute on function public.confirm_delivery(uuid, text) to authenticated;

-- 6) Notificações automáticas (persistentes) por mudança de status / atribuição
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
      when 'cancelled'  then 'Seu pedido foi cancelado.'
      else null end;
    if msg is not null then
      insert into public.notifications(user_id, audience, title, body, order_id, read)
      values (new.customer_id, 'customer', 'Pedido ' || new.code, msg, new.id, false);
    end if;
  end if;
  return new;
end; $$;
drop trigger if exists trg_notify_order_update on public.orders;
create trigger trg_notify_order_update after update on public.orders
  for each row execute function public.notify_order_update();

-- notifica ao CRIAR o pedido (recebido) + avisa o admin
create or replace function public.notify_new_order()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.notifications(user_id, audience, title, body, order_id, read)
  values (new.customer_id, 'customer', 'Pedido ' || new.code,
          'Pedido recebido! Estamos preparando tudo. 🟡', new.id, false);
  return new;
end; $$;
drop trigger if exists trg_notify_new_order on public.orders;
create trigger trg_notify_new_order after insert on public.orders
  for each row execute function public.notify_new_order();

-- Gera códigos para pedidos que ainda não têm (retrocompatibilidade)
insert into public.order_delivery_codes(order_id, code)
select o.id, lpad((floor(random() * 1000000))::int::text, 6, '0')
from public.orders o
left join public.order_delivery_codes c on c.order_id = o.id
where c.order_id is null;

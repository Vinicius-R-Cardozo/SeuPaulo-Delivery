-- =====================================================================
-- Seu Paulo Delivery — Row Level Security (RLS)
-- A segurança de verdade vive AQUI, no banco — nunca no frontend.
-- Rode após 0001_init.sql.
-- =====================================================================

-- Funções auxiliares de papel (SECURITY DEFINER para evitar recursão de RLS).
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

create or replace function public.is_driver()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'driver');
$$;

-- Habilita RLS em todas as tabelas.
alter table public.profiles              enable row level security;
alter table public.addresses             enable row level security;
alter table public.categories            enable row level security;
alter table public.products              enable row level security;
alter table public.coupons               enable row level security;
alter table public.coupon_usage          enable row level security;
alter table public.drivers               enable row level security;
alter table public.driver_locations      enable row level security;
alter table public.orders                enable row level security;
alter table public.order_items           enable row level security;
alter table public.order_status_history  enable row level security;
alter table public.payments              enable row level security;
alter table public.notifications         enable row level security;

-- ------------------------- PROFILES -------------------------
create policy "profiles: ler o próprio ou admin"
  on public.profiles for select using (id = auth.uid() or public.is_admin());
create policy "profiles: atualizar o próprio ou admin"
  on public.profiles for update using (id = auth.uid() or public.is_admin());
-- Inserção acontece via trigger handle_new_user (security definer).

-- ------------------------- ADDRESSES ------------------------
create policy "addresses: dono lê/escreve; admin lê"
  on public.addresses for select using (user_id = auth.uid() or public.is_admin());
create policy "addresses: dono insere"
  on public.addresses for insert with check (user_id = auth.uid());
create policy "addresses: dono atualiza"
  on public.addresses for update using (user_id = auth.uid());
create policy "addresses: dono remove"
  on public.addresses for delete using (user_id = auth.uid());

-- ---------------------- CATEGORIES / PRODUCTS ---------------
-- Leitura pública (cardápio); escrita só admin.
create policy "categories: leitura pública" on public.categories for select using (true);
create policy "categories: admin escreve" on public.categories for all
  using (public.is_admin()) with check (public.is_admin());

create policy "products: leitura pública" on public.products for select using (true);
create policy "products: admin escreve" on public.products for all
  using (public.is_admin()) with check (public.is_admin());

-- --------------------------- COUPONS ------------------------
create policy "coupons: autenticado lê ativos"
  on public.coupons for select using (auth.uid() is not null);
create policy "coupons: admin escreve" on public.coupons for all
  using (public.is_admin()) with check (public.is_admin());

create policy "coupon_usage: dono lê; admin tudo"
  on public.coupon_usage for select using (user_id = auth.uid() or public.is_admin());
create policy "coupon_usage: dono registra"
  on public.coupon_usage for insert with check (user_id = auth.uid());

-- --------------------------- DRIVERS ------------------------
create policy "drivers: self lê; admin lê"
  on public.drivers for select using (id = auth.uid() or public.is_admin());
create policy "drivers: self insere (no cadastro)"
  on public.drivers for insert with check (id = auth.uid());
-- O entregador atualiza os próprios campos operacionais (online/localização);
-- a MUDANÇA DE STATUS (aprovação/bloqueio) é responsabilidade do admin.
create policy "drivers: self atualiza"
  on public.drivers for update using (id = auth.uid()) with check (id = auth.uid());
create policy "drivers: admin atualiza"
  on public.drivers for update using (public.is_admin()) with check (public.is_admin());

create policy "driver_locations: self escreve"
  on public.driver_locations for insert with check (driver_id = auth.uid());
create policy "driver_locations: self/admin lê"
  on public.driver_locations for select using (driver_id = auth.uid() or public.is_admin());

-- ---------------------------- ORDERS ------------------------
-- SELECT:
--   cliente vê os próprios; admin vê todos; entregador vê os atribuídos a ele
--   E também os disponíveis (prontos, entrega, sem entregador) para poder aceitar.
create policy "orders: leitura por papel"
  on public.orders for select using (
    customer_id = auth.uid()
    or public.is_admin()
    or (public.is_driver() and (
         driver_id = auth.uid()
         or (driver_id is null and status = 'ready' and fulfillment = 'delivery')
       ))
  );

-- INSERT: cliente cria o próprio pedido.
create policy "orders: cliente cria o próprio"
  on public.orders for insert with check (customer_id = auth.uid());

-- UPDATE:
--   admin: tudo.
--   cliente: só o próprio (ex.: cancelar enquanto ainda não saiu).
--   entregador: pedidos atribuídos a ele, ou reivindicar um disponível.
create policy "orders: admin atualiza tudo"
  on public.orders for update using (public.is_admin()) with check (public.is_admin());
create policy "orders: cliente atualiza o próprio"
  on public.orders for update using (customer_id = auth.uid()) with check (customer_id = auth.uid());
create policy "orders: entregador atualiza atribuídos/disponíveis"
  on public.orders for update
  using (
    public.is_driver() and (
      driver_id = auth.uid()
      or (driver_id is null and status = 'ready' and fulfillment = 'delivery')
    )
  )
  with check (public.is_driver() and (driver_id = auth.uid() or driver_id is null));

-- Itens/histórico normalizados: visíveis a quem enxerga o pedido pai; escrita admin.
create policy "order_items: lê via pedido"
  on public.order_items for select using (
    exists (select 1 from public.orders o where o.id = order_id
            and (o.customer_id = auth.uid() or o.driver_id = auth.uid() or public.is_admin()))
  );
create policy "order_items: admin escreve" on public.order_items for all
  using (public.is_admin()) with check (public.is_admin());

create policy "order_status_history: lê via pedido"
  on public.order_status_history for select using (
    exists (select 1 from public.orders o where o.id = order_id
            and (o.customer_id = auth.uid() or o.driver_id = auth.uid() or public.is_admin()))
  );
create policy "order_status_history: admin/entregador escreve"
  on public.order_status_history for insert with check (public.is_admin() or public.is_driver());

-- --------------------------- PAYMENTS -----------------------
-- Cliente vê os pagamentos dos próprios pedidos; admin tudo.
-- Inserção/atualização de status idealmente por webhook (service_role); admin pode ver.
create policy "payments: lê via pedido"
  on public.payments for select using (
    exists (select 1 from public.orders o where o.id = order_id
            and (o.customer_id = auth.uid() or public.is_admin()))
  );
create policy "payments: cliente registra intenção do próprio pedido"
  on public.payments for insert with check (
    exists (select 1 from public.orders o where o.id = order_id and o.customer_id = auth.uid())
  );

-- ------------------------- NOTIFICATIONS --------------------
create policy "notifications: dono lê"
  on public.notifications for select using (user_id = auth.uid() or public.is_admin());
create policy "notifications: dono marca como lida"
  on public.notifications for update using (user_id = auth.uid());
-- A criação de notificações para outros usuários deve ser feita pelo backend
-- (service_role) ou por triggers; por isso não há policy de INSERT para clientes.

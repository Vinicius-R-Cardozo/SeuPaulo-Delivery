-- ============================================================
-- Seu Paulo Delivery — TUDO em ordem (init + RLS + seed)
-- Cole este arquivo inteiro no SQL Editor do Supabase e execute.
-- ============================================================

-- >>>>>>>>>> 0001_init.sql <<<<<<<<<<
-- =====================================================================
-- Seu Paulo Delivery — Esquema inicial (Supabase / PostgreSQL)
-- Rode este arquivo no SQL Editor do Supabase (ou via CLI de migrações).
-- A ordem é: 0001_init.sql -> 0002_rls.sql -> 0003_seed.sql
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- PERFIS (1:1 com auth.users). Papel do usuário no sistema.
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'customer' check (role in ('customer','driver','admin')),
  full_name text not null,
  email text not null,
  phone text,
  avatar_url text,
  created_at timestamptz not null default now()
);

-- Cria o profile automaticamente quando um usuário se registra no Auth,
-- lendo o metadata enviado no signUp (full_name, phone, role).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, role, full_name, email, phone)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'role', 'customer'),
    coalesce(new.raw_user_meta_data->>'full_name', 'Cliente'),
    new.email,
    new.raw_user_meta_data->>'phone'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- ENDEREÇOS do cliente
-- ---------------------------------------------------------------------
create table if not exists public.addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  label text not null default 'casa' check (label in ('casa','trabalho','outro')),
  street text not null,
  number text not null,
  complement text,
  reference text,
  neighborhood text not null,
  city text not null,
  state text not null,
  zip text,
  lat double precision not null,
  lng double precision not null,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists addresses_user_idx on public.addresses(user_id);

-- ---------------------------------------------------------------------
-- CATEGORIAS e PRODUTOS do cardápio
-- ---------------------------------------------------------------------
create table if not exists public.categories (
  id text primary key,
  slug text not null unique,
  name text not null,
  emoji text not null default '🍽️',
  sort_order int not null default 0
);

create table if not exists public.products (
  id text primary key,
  category_slug text not null references public.categories(slug),
  name text not null,
  description text default '',
  price numeric(10,2) not null check (price >= 0),
  image text default '',
  available boolean not null default true,
  serves text,
  tags text[] default '{}',
  popular boolean not null default false,
  is_new boolean not null default false,
  addon_groups jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists products_category_idx on public.products(category_slug);

-- ---------------------------------------------------------------------
-- CUPONS
-- ---------------------------------------------------------------------
create table if not exists public.coupons (
  code text primary key,
  description text default '',
  type text not null check (type in ('percent','fixed')),
  value numeric(10,2) not null check (value >= 0),
  min_subtotal numeric(10,2) not null default 0,
  max_uses int not null default 1000,
  used_count int not null default 0,
  expires_at timestamptz not null,
  active boolean not null default true
);

create table if not exists public.coupon_usage (
  id uuid primary key default gen_random_uuid(),
  coupon_code text not null references public.coupons(code),
  user_id uuid not null references public.profiles(id) on delete cascade,
  order_id uuid,
  used_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- ENTREGADORES (1:1 com profiles cujo role = 'driver')
-- ---------------------------------------------------------------------
create table if not exists public.drivers (
  id uuid primary key references public.profiles(id) on delete cascade,
  vehicle_type text not null default 'moto' check (vehicle_type in ('moto','carro','bicicleta')),
  plate text not null,
  model text not null,
  color text not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected','blocked')),
  online boolean not null default false,
  location_lat double precision,
  location_lng double precision,
  rating numeric(3,2) not null default 0,
  total_deliveries int not null default 0,
  created_at timestamptz not null default now()
);

-- Histórico de localização do entregador (opcional; para trilha/telemetria).
create table if not exists public.driver_locations (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references public.drivers(id) on delete cascade,
  lat double precision not null,
  lng double precision not null,
  recorded_at timestamptz not null default now()
);
create index if not exists driver_locations_driver_idx on public.driver_locations(driver_id, recorded_at desc);

-- ---------------------------------------------------------------------
-- PEDIDOS
-- Observação: `items`, `address` e `status_history` são snapshots em JSONB —
-- padrão em delivery para preservar o pedido mesmo que o cardápio mude depois.
-- ---------------------------------------------------------------------
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  customer_id uuid not null references public.profiles(id) on delete cascade,
  customer_name text not null,
  customer_phone text,
  items jsonb not null default '[]'::jsonb,
  fulfillment text not null default 'delivery' check (fulfillment in ('delivery','pickup')),
  address jsonb,
  subtotal numeric(10,2) not null,
  delivery_fee numeric(10,2) not null default 0,
  discount numeric(10,2) not null default 0,
  total numeric(10,2) not null,
  coupon_code text,
  payment_method text not null check (payment_method in ('pix','card','cash')),
  payment_status text not null default 'pending' check (payment_status in ('pending','approved','failed','refunded')),
  change_for numeric(10,2),
  status text not null default 'received'
    check (status in ('received','confirmed','preparing','ready','on_the_way','delivered','cancelled')),
  status_history jsonb not null default '[]'::jsonb,
  driver_id uuid references public.drivers(id) on delete set null,
  driver_lat double precision,
  driver_lng double precision,
  eta_minutes int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists orders_customer_idx on public.orders(customer_id, created_at desc);
create index if not exists orders_driver_idx on public.orders(driver_id);
create index if not exists orders_status_idx on public.orders(status);

-- Itens normalizados (opcional — para relatórios/BI). O app usa orders.items (jsonb).
create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id text,
  name text not null,
  quantity int not null,
  unit_price numeric(10,2) not null,
  addons jsonb default '[]'::jsonb,
  notes text
);

-- Histórico de status normalizado (opcional). O app usa orders.status_history (jsonb).
create table if not exists public.order_status_history (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  status text not null,
  note text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- PAGAMENTOS (a confirmação real vem por webhook do gateway)
-- ---------------------------------------------------------------------
create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  amount numeric(10,2) not null,
  method text not null check (method in ('pix','card','cash')),
  status text not null default 'pending' check (status in ('pending','approved','failed','refunded')),
  provider text default 'demo',
  provider_payment_id text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- NOTIFICAÇÕES
-- ---------------------------------------------------------------------
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  audience text not null check (audience in ('customer','driver','admin')),
  title text not null,
  body text not null,
  order_id uuid references public.orders(id) on delete set null,
  read boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_idx on public.notifications(user_id, created_at desc);

-- Mantém orders.updated_at sempre atual.
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
drop trigger if exists orders_touch_updated on public.orders;
create trigger orders_touch_updated before update on public.orders
  for each row execute function public.touch_updated_at();

-- Realtime: publica a tabela de pedidos para o acompanhamento ao vivo.
alter publication supabase_realtime add table public.orders;
alter publication supabase_realtime add table public.drivers;

-- >>>>>>>>>> 0002_rls.sql <<<<<<<<<<
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

-- >>>>>>>>>> 0003_seed.sql <<<<<<<<<<
-- =====================================================================
-- Seu Paulo Delivery — Seed do cardápio e cupons (gerado automaticamente).
-- NÃO edite à mão: rode "npm run gen:seed". Rode após 0002_rls.sql.
-- =====================================================================

-- Categorias
insert into public.categories (id, slug, name, emoji, sort_order) values ('c0', 'mais-pedidos', 'Mais pedidos', '⭐', 0) on conflict (id) do update set name=excluded.name, emoji=excluded.emoji, sort_order=excluded.sort_order;
insert into public.categories (id, slug, name, emoji, sort_order) values ('c1', 'petiscos', 'Petiscos', '🍟', 1) on conflict (id) do update set name=excluded.name, emoji=excluded.emoji, sort_order=excluded.sort_order;
insert into public.categories (id, slug, name, emoji, sort_order) values ('c2', 'porcoes', 'Porções', '🍽️', 2) on conflict (id) do update set name=excluded.name, emoji=excluded.emoji, sort_order=excluded.sort_order;
insert into public.categories (id, slug, name, emoji, sort_order) values ('c3', 'pratos', 'Pratos', '🥩', 3) on conflict (id) do update set name=excluded.name, emoji=excluded.emoji, sort_order=excluded.sort_order;
insert into public.categories (id, slug, name, emoji, sort_order) values ('c4', 'lanches', 'Lanches', '🍔', 4) on conflict (id) do update set name=excluded.name, emoji=excluded.emoji, sort_order=excluded.sort_order;
insert into public.categories (id, slug, name, emoji, sort_order) values ('c5', 'drinks', 'Drinks & Caipirinhas', '🍹', 5) on conflict (id) do update set name=excluded.name, emoji=excluded.emoji, sort_order=excluded.sort_order;
insert into public.categories (id, slug, name, emoji, sort_order) values ('c6', 'cervejas', 'Cervejas', '🍺', 6) on conflict (id) do update set name=excluded.name, emoji=excluded.emoji, sort_order=excluded.sort_order;
insert into public.categories (id, slug, name, emoji, sort_order) values ('c7', 'bebidas', 'Bebidas', '🥤', 7) on conflict (id) do update set name=excluded.name, emoji=excluded.emoji, sort_order=excluded.sort_order;

-- Produtos
insert into public.products (id, category_slug, name, description, price, image, available, serves, tags, popular, is_new, addon_groups) values ('p-torresmo', 'petiscos', 'Torresmo de Rolo', 'Torresmo pururuca crocante, cortado na hora, com limão e pimenta de cheiro.', 32.9, '/prato.jpg', true, 'Serve 2', array['crocante','da casa']::text[], true, false, '[{"id":"g-add-porcao","name":"Turbine sua porção","type":"multiple","required":false,"min":0,"max":3,"options":[{"id":"p-bacon","name":"Bacon em cubos","price":6},{"id":"p-queijo","name":"Queijo coalho extra","price":7},{"id":"p-vinagrete","name":"Vinagrete","price":3}]}]'::jsonb) on conflict (id) do update set name=excluded.name, description=excluded.description, price=excluded.price, image=excluded.image, available=excluded.available, serves=excluded.serves, tags=excluded.tags, popular=excluded.popular, is_new=excluded.is_new, addon_groups=excluded.addon_groups;
insert into public.products (id, category_slug, name, description, price, image, available, serves, tags, popular, is_new, addon_groups) values ('p-bolinho', 'petiscos', 'Bolinho de Feijoada', 'Oito bolinhos recheados de feijoada, empanados e fritos, com geleia de pimenta.', 28.9, '/menu-comidas.jpg', true, 'Serve 2', array[]::text[], true, false, '[]'::jsonb) on conflict (id) do update set name=excluded.name, description=excluded.description, price=excluded.price, image=excluded.image, available=excluded.available, serves=excluded.serves, tags=excluded.tags, popular=excluded.popular, is_new=excluded.is_new, addon_groups=excluded.addon_groups;
insert into public.products (id, category_slug, name, description, price, image, available, serves, tags, popular, is_new, addon_groups) values ('p-calabresa', 'petiscos', 'Calabresa Acebolada', 'Linguiça calabresa artesanal, cebola caramelizada e pão de alho tostado.', 34.9, '/menu-comidas.jpg', true, 'Serve 2 a 3', array[]::text[], false, false, '[{"id":"g-add-porcao","name":"Turbine sua porção","type":"multiple","required":false,"min":0,"max":3,"options":[{"id":"p-bacon","name":"Bacon em cubos","price":6},{"id":"p-queijo","name":"Queijo coalho extra","price":7},{"id":"p-vinagrete","name":"Vinagrete","price":3}]}]'::jsonb) on conflict (id) do update set name=excluded.name, description=excluded.description, price=excluded.price, image=excluded.image, available=excluded.available, serves=excluded.serves, tags=excluded.tags, popular=excluded.popular, is_new=excluded.is_new, addon_groups=excluded.addon_groups;
insert into public.products (id, category_slug, name, description, price, image, available, serves, tags, popular, is_new, addon_groups) values ('p-dadinho', 'petiscos', 'Dadinho de Tapioca', 'Cubos de tapioca com queijo coalho, crocantes por fora, com geleia de pimenta.', 26.9, '/prato.jpg', true, 'Serve 2', array[]::text[], false, true, '[]'::jsonb) on conflict (id) do update set name=excluded.name, description=excluded.description, price=excluded.price, image=excluded.image, available=excluded.available, serves=excluded.serves, tags=excluded.tags, popular=excluded.popular, is_new=excluded.is_new, addon_groups=excluded.addon_groups;
insert into public.products (id, category_slug, name, description, price, image, available, serves, tags, popular, is_new, addon_groups) values ('p-frango', 'porcoes', 'Frango a Passarinho', 'Frango frito crocante no alho e óleo, salsinha e limão. O clássico do boteco.', 44.9, '/prato.jpg', true, 'Serve 3', array[]::text[], true, false, '[{"id":"g-tam-porcao","name":"Tamanho","type":"single","required":true,"min":1,"max":1,"options":[{"id":"t-meia","name":"Meia porção","price":0},{"id":"t-inteira","name":"Porção inteira","price":18}]},{"id":"g-add-porcao","name":"Turbine sua porção","type":"multiple","required":false,"min":0,"max":3,"options":[{"id":"p-bacon","name":"Bacon em cubos","price":6},{"id":"p-queijo","name":"Queijo coalho extra","price":7},{"id":"p-vinagrete","name":"Vinagrete","price":3}]}]'::jsonb) on conflict (id) do update set name=excluded.name, description=excluded.description, price=excluded.price, image=excluded.image, available=excluded.available, serves=excluded.serves, tags=excluded.tags, popular=excluded.popular, is_new=excluded.is_new, addon_groups=excluded.addon_groups;
insert into public.products (id, category_slug, name, description, price, image, available, serves, tags, popular, is_new, addon_groups) values ('p-mandioca', 'porcoes', 'Mandioca com Queijo Coalho', 'Mandioca frita seca por fora e macia por dentro, com queijo coalho grelhado.', 33.9, '/menu-comidas.jpg', true, 'Serve 2 a 3', array[]::text[], false, false, '[{"id":"g-tam-porcao","name":"Tamanho","type":"single","required":true,"min":1,"max":1,"options":[{"id":"t-meia","name":"Meia porção","price":0},{"id":"t-inteira","name":"Porção inteira","price":18}]}]'::jsonb) on conflict (id) do update set name=excluded.name, description=excluded.description, price=excluded.price, image=excluded.image, available=excluded.available, serves=excluded.serves, tags=excluded.tags, popular=excluded.popular, is_new=excluded.is_new, addon_groups=excluded.addon_groups;
insert into public.products (id, category_slug, name, description, price, image, available, serves, tags, popular, is_new, addon_groups) values ('p-costela', 'porcoes', 'Costelinha ao Barbecue', 'Costelinha suína assada lentamente, ao molho barbecue da casa, com farofa.', 58.9, '/prato.jpg', true, 'Serve 3', array[]::text[], true, false, '[{"id":"g-add-porcao","name":"Turbine sua porção","type":"multiple","required":false,"min":0,"max":3,"options":[{"id":"p-bacon","name":"Bacon em cubos","price":6},{"id":"p-queijo","name":"Queijo coalho extra","price":7},{"id":"p-vinagrete","name":"Vinagrete","price":3}]}]'::jsonb) on conflict (id) do update set name=excluded.name, description=excluded.description, price=excluded.price, image=excluded.image, available=excluded.available, serves=excluded.serves, tags=excluded.tags, popular=excluded.popular, is_new=excluded.is_new, addon_groups=excluded.addon_groups;
insert into public.products (id, category_slug, name, description, price, image, available, serves, tags, popular, is_new, addon_groups) values ('p-batata', 'porcoes', 'Batata Frita com Cheddar e Bacon', 'Batata rústica coberta com cheddar cremoso e bacon crocante.', 36.9, '/menu-comidas.jpg', true, 'Serve 2 a 3', array[]::text[], false, false, '[{"id":"g-tam-porcao","name":"Tamanho","type":"single","required":true,"min":1,"max":1,"options":[{"id":"t-meia","name":"Meia porção","price":0},{"id":"t-inteira","name":"Porção inteira","price":18}]},{"id":"g-add-porcao","name":"Turbine sua porção","type":"multiple","required":false,"min":0,"max":3,"options":[{"id":"p-bacon","name":"Bacon em cubos","price":6},{"id":"p-queijo","name":"Queijo coalho extra","price":7},{"id":"p-vinagrete","name":"Vinagrete","price":3}]}]'::jsonb) on conflict (id) do update set name=excluded.name, description=excluded.description, price=excluded.price, image=excluded.image, available=excluded.available, serves=excluded.serves, tags=excluded.tags, popular=excluded.popular, is_new=excluded.is_new, addon_groups=excluded.addon_groups;
insert into public.products (id, category_slug, name, description, price, image, available, serves, tags, popular, is_new, addon_groups) values ('p-picanha', 'pratos', 'Picanha na Chapa', 'Picanha na chapa com arroz, feijão tropeiro, vinagrete e mandioca frita.', 72.9, '/prato.jpg', true, 'Serve 2', array[]::text[], true, false, '[{"id":"g-ponto","name":"Ponto da carne","type":"single","required":true,"min":1,"max":1,"options":[{"id":"o-malp","name":"Mal passada","price":0},{"id":"o-aop","name":"Ao ponto","price":0},{"id":"o-bemp","name":"Bem passada","price":0}]}]'::jsonb) on conflict (id) do update set name=excluded.name, description=excluded.description, price=excluded.price, image=excluded.image, available=excluded.available, serves=excluded.serves, tags=excluded.tags, popular=excluded.popular, is_new=excluded.is_new, addon_groups=excluded.addon_groups;
insert into public.products (id, category_slug, name, description, price, image, available, serves, tags, popular, is_new, addon_groups) values ('p-feijoada', 'pratos', 'Feijoada do Seu Paulo', 'Feijoada completa com arroz, couve, farofa, torresmo e laranja. Sábado é dia!', 49.9, '/menu-comidas.jpg', true, 'Serve 1 a 2', array[]::text[], false, false, '[]'::jsonb) on conflict (id) do update set name=excluded.name, description=excluded.description, price=excluded.price, image=excluded.image, available=excluded.available, serves=excluded.serves, tags=excluded.tags, popular=excluded.popular, is_new=excluded.is_new, addon_groups=excluded.addon_groups;
insert into public.products (id, category_slug, name, description, price, image, available, serves, tags, popular, is_new, addon_groups) values ('p-parmegiana', 'pratos', 'Filé à Parmegiana', 'Filé empanado ao molho de tomate e queijo gratinado, com arroz e fritas.', 54.9, '/prato.jpg', true, 'Serve 2', array[]::text[], false, false, '[{"id":"g-ponto","name":"Ponto da carne","type":"single","required":true,"min":1,"max":1,"options":[{"id":"o-malp","name":"Mal passada","price":0},{"id":"o-aop","name":"Ao ponto","price":0},{"id":"o-bemp","name":"Bem passada","price":0}]}]'::jsonb) on conflict (id) do update set name=excluded.name, description=excluded.description, price=excluded.price, image=excluded.image, available=excluded.available, serves=excluded.serves, tags=excluded.tags, popular=excluded.popular, is_new=excluded.is_new, addon_groups=excluded.addon_groups;
insert into public.products (id, category_slug, name, description, price, image, available, serves, tags, popular, is_new, addon_groups) values ('p-xburguer', 'lanches', 'X-Burguer do Seu Paulo', 'Blend 180g, queijo, alface, tomate, cebola e molho especial no pão brioche.', 29.9, '/menu-comidas.jpg', true, null, array[]::text[], true, false, '[{"id":"g-ponto","name":"Ponto da carne","type":"single","required":true,"min":1,"max":1,"options":[{"id":"o-malp","name":"Mal passada","price":0},{"id":"o-aop","name":"Ao ponto","price":0},{"id":"o-bemp","name":"Bem passada","price":0}]},{"id":"g-add-lanche","name":"Adicionais","type":"multiple","required":false,"min":0,"max":6,"options":[{"id":"a-bacon","name":"Bacon","price":4},{"id":"a-queijo","name":"Queijo extra","price":3.5},{"id":"a-cheddar","name":"Cheddar","price":3.5},{"id":"a-ovo","name":"Ovo","price":2.5},{"id":"a-catupiry","name":"Catupiry","price":4},{"id":"a-molho","name":"Molho especial da casa","price":2}]},{"id":"g-rem-lanche","name":"Remover ingredientes","type":"multiple","required":false,"min":0,"max":4,"options":[{"id":"r-cebola","name":"Sem cebola","price":0},{"id":"r-tomate","name":"Sem tomate","price":0},{"id":"r-alface","name":"Sem alface","price":0},{"id":"r-molho","name":"Sem molho","price":0}]}]'::jsonb) on conflict (id) do update set name=excluded.name, description=excluded.description, price=excluded.price, image=excluded.image, available=excluded.available, serves=excluded.serves, tags=excluded.tags, popular=excluded.popular, is_new=excluded.is_new, addon_groups=excluded.addon_groups;
insert into public.products (id, category_slug, name, description, price, image, available, serves, tags, popular, is_new, addon_groups) values ('p-baconburguer', 'lanches', 'Bacon Duplo', 'Dois blends 90g, cheddar, muito bacon e cebola caramelizada no pão brioche.', 37.9, '/menu-comidas.jpg', true, null, array[]::text[], false, true, '[{"id":"g-ponto","name":"Ponto da carne","type":"single","required":true,"min":1,"max":1,"options":[{"id":"o-malp","name":"Mal passada","price":0},{"id":"o-aop","name":"Ao ponto","price":0},{"id":"o-bemp","name":"Bem passada","price":0}]},{"id":"g-add-lanche","name":"Adicionais","type":"multiple","required":false,"min":0,"max":6,"options":[{"id":"a-bacon","name":"Bacon","price":4},{"id":"a-queijo","name":"Queijo extra","price":3.5},{"id":"a-cheddar","name":"Cheddar","price":3.5},{"id":"a-ovo","name":"Ovo","price":2.5},{"id":"a-catupiry","name":"Catupiry","price":4},{"id":"a-molho","name":"Molho especial da casa","price":2}]},{"id":"g-rem-lanche","name":"Remover ingredientes","type":"multiple","required":false,"min":0,"max":4,"options":[{"id":"r-cebola","name":"Sem cebola","price":0},{"id":"r-tomate","name":"Sem tomate","price":0},{"id":"r-alface","name":"Sem alface","price":0},{"id":"r-molho","name":"Sem molho","price":0}]}]'::jsonb) on conflict (id) do update set name=excluded.name, description=excluded.description, price=excluded.price, image=excluded.image, available=excluded.available, serves=excluded.serves, tags=excluded.tags, popular=excluded.popular, is_new=excluded.is_new, addon_groups=excluded.addon_groups;
insert into public.products (id, category_slug, name, description, price, image, available, serves, tags, popular, is_new, addon_groups) values ('p-frangoburguer', 'lanches', 'Frango Crispy', 'Filé de frango empanado crocante, maionese temperada, alface e tomate.', 31.9, '/menu-comidas.jpg', true, null, array[]::text[], false, false, '[{"id":"g-add-lanche","name":"Adicionais","type":"multiple","required":false,"min":0,"max":6,"options":[{"id":"a-bacon","name":"Bacon","price":4},{"id":"a-queijo","name":"Queijo extra","price":3.5},{"id":"a-cheddar","name":"Cheddar","price":3.5},{"id":"a-ovo","name":"Ovo","price":2.5},{"id":"a-catupiry","name":"Catupiry","price":4},{"id":"a-molho","name":"Molho especial da casa","price":2}]},{"id":"g-rem-lanche","name":"Remover ingredientes","type":"multiple","required":false,"min":0,"max":4,"options":[{"id":"r-cebola","name":"Sem cebola","price":0},{"id":"r-tomate","name":"Sem tomate","price":0},{"id":"r-alface","name":"Sem alface","price":0},{"id":"r-molho","name":"Sem molho","price":0}]}]'::jsonb) on conflict (id) do update set name=excluded.name, description=excluded.description, price=excluded.price, image=excluded.image, available=excluded.available, serves=excluded.serves, tags=excluded.tags, popular=excluded.popular, is_new=excluded.is_new, addon_groups=excluded.addon_groups;
insert into public.products (id, category_slug, name, description, price, image, available, serves, tags, popular, is_new, addon_groups) values ('p-caipirinha', 'drinks', 'Caipirinha da Casa', 'A caipirinha tradicional, do jeito que o boteco faz. Escolha a fruta e a dose.', 18.9, '/menu-caipirinhas.jpg', true, null, array[]::text[], true, false, '[{"id":"g-dose","name":"Bebida","type":"single","required":true,"min":1,"max":1,"options":[{"id":"d-cachaca","name":"Cachaça","price":0},{"id":"d-vodka","name":"Vodka","price":4},{"id":"d-saque","name":"Saquê","price":3}]},{"id":"g-fruta","name":"Fruta","type":"single","required":true,"min":1,"max":1,"options":[{"id":"f-limao","name":"Limão","price":0},{"id":"f-morango","name":"Morango","price":3},{"id":"f-maracuja","name":"Maracujá","price":3},{"id":"f-kiwi","name":"Kiwi","price":4}]}]'::jsonb) on conflict (id) do update set name=excluded.name, description=excluded.description, price=excluded.price, image=excluded.image, available=excluded.available, serves=excluded.serves, tags=excluded.tags, popular=excluded.popular, is_new=excluded.is_new, addon_groups=excluded.addon_groups;
insert into public.products (id, category_slug, name, description, price, image, available, serves, tags, popular, is_new, addon_groups) values ('p-gin', 'drinks', 'Gin Tônica', 'Gin, água tônica, zimbro e rodela de limão siciliano. Refrescante.', 26.9, '/menu-caipirinhas.jpg', true, null, array[]::text[], false, false, '[]'::jsonb) on conflict (id) do update set name=excluded.name, description=excluded.description, price=excluded.price, image=excluded.image, available=excluded.available, serves=excluded.serves, tags=excluded.tags, popular=excluded.popular, is_new=excluded.is_new, addon_groups=excluded.addon_groups;
insert into public.products (id, category_slug, name, description, price, image, available, serves, tags, popular, is_new, addon_groups) values ('p-batida', 'drinks', 'Batida de Coco', 'Cachaça, leite condensado e coco. Cremosa e traiçoeira, do jeito certo.', 19.9, '/menu-caipirinhas.jpg', true, null, array[]::text[], false, false, '[]'::jsonb) on conflict (id) do update set name=excluded.name, description=excluded.description, price=excluded.price, image=excluded.image, available=excluded.available, serves=excluded.serves, tags=excluded.tags, popular=excluded.popular, is_new=excluded.is_new, addon_groups=excluded.addon_groups;
insert into public.products (id, category_slug, name, description, price, image, available, serves, tags, popular, is_new, addon_groups) values ('p-brahma', 'cervejas', 'Brahma 600ml', 'Garrafa gelada de 600ml. Estupidamente gelada, como manda a tradição.', 12.9, '/canecas.jpg', true, null, array[]::text[], true, false, '[]'::jsonb) on conflict (id) do update set name=excluded.name, description=excluded.description, price=excluded.price, image=excluded.image, available=excluded.available, serves=excluded.serves, tags=excluded.tags, popular=excluded.popular, is_new=excluded.is_new, addon_groups=excluded.addon_groups;
insert into public.products (id, category_slug, name, description, price, image, available, serves, tags, popular, is_new, addon_groups) values ('p-heineken', 'cervejas', 'Heineken Long Neck', 'Long neck 330ml gelada.', 10.9, '/canecas.jpg', true, null, array[]::text[], false, false, '[]'::jsonb) on conflict (id) do update set name=excluded.name, description=excluded.description, price=excluded.price, image=excluded.image, available=excluded.available, serves=excluded.serves, tags=excluded.tags, popular=excluded.popular, is_new=excluded.is_new, addon_groups=excluded.addon_groups;
insert into public.products (id, category_slug, name, description, price, image, available, serves, tags, popular, is_new, addon_groups) values ('p-original', 'cervejas', 'Antarctica Original 600ml', 'A cerveja pilsen puro malte, garrafa de 600ml.', 13.9, '/canecas.jpg', true, null, array[]::text[], false, false, '[]'::jsonb) on conflict (id) do update set name=excluded.name, description=excluded.description, price=excluded.price, image=excluded.image, available=excluded.available, serves=excluded.serves, tags=excluded.tags, popular=excluded.popular, is_new=excluded.is_new, addon_groups=excluded.addon_groups;
insert into public.products (id, category_slug, name, description, price, image, available, serves, tags, popular, is_new, addon_groups) values ('p-refri', 'bebidas', 'Refrigerante Lata', 'Coca-Cola, Guaraná ou Fanta. Lata 350ml gelada.', 6.5, '/canecas.jpg', true, null, array[]::text[], false, false, '[{"id":"g-refri","name":"Sabor","type":"single","required":true,"min":1,"max":1,"options":[{"id":"rf-coca","name":"Coca-Cola","price":0},{"id":"rf-guarana","name":"Guaraná Antarctica","price":0},{"id":"rf-fanta","name":"Fanta Laranja","price":0},{"id":"rf-cocazero","name":"Coca-Cola Zero","price":0}]}]'::jsonb) on conflict (id) do update set name=excluded.name, description=excluded.description, price=excluded.price, image=excluded.image, available=excluded.available, serves=excluded.serves, tags=excluded.tags, popular=excluded.popular, is_new=excluded.is_new, addon_groups=excluded.addon_groups;
insert into public.products (id, category_slug, name, description, price, image, available, serves, tags, popular, is_new, addon_groups) values ('p-agua', 'bebidas', 'Água Mineral 500ml', 'Com ou sem gás.', 4.5, '/canecas.jpg', true, null, array[]::text[], false, false, '[{"id":"g-agua","name":"Tipo","type":"single","required":true,"min":1,"max":1,"options":[{"id":"ag-sem","name":"Sem gás","price":0},{"id":"ag-com","name":"Com gás","price":0}]}]'::jsonb) on conflict (id) do update set name=excluded.name, description=excluded.description, price=excluded.price, image=excluded.image, available=excluded.available, serves=excluded.serves, tags=excluded.tags, popular=excluded.popular, is_new=excluded.is_new, addon_groups=excluded.addon_groups;
insert into public.products (id, category_slug, name, description, price, image, available, serves, tags, popular, is_new, addon_groups) values ('p-sucos', 'bebidas', 'Suco Natural 500ml', 'Feito na hora. Laranja, maracujá, abacaxi ou limão.', 11.9, '/menu-caipirinhas.jpg', true, null, array[]::text[], false, false, '[{"id":"g-suco","name":"Sabor","type":"single","required":true,"min":1,"max":1,"options":[{"id":"su-laranja","name":"Laranja","price":0},{"id":"su-maracuja","name":"Maracujá","price":0},{"id":"su-abacaxi","name":"Abacaxi","price":0},{"id":"su-limao","name":"Limão","price":0}]}]'::jsonb) on conflict (id) do update set name=excluded.name, description=excluded.description, price=excluded.price, image=excluded.image, available=excluded.available, serves=excluded.serves, tags=excluded.tags, popular=excluded.popular, is_new=excluded.is_new, addon_groups=excluded.addon_groups;

-- Cupons de exemplo
insert into public.coupons (code, description, type, value, min_subtotal, max_uses, used_count, expires_at, active) values
  ('BEMVINDO10', '10% de desconto no primeiro pedido', 'percent', 10, 30, 1000, 0, now() + interval '90 days', true),
  ('SEUPAULO',   'R$ 15 off em pedidos acima de R$ 80', 'fixed', 15, 80, 500, 0, now() + interval '60 days', true),
  ('PROMOCAO',   '20% off na semana do boteco', 'percent', 20, 50, 200, 0, now() + interval '30 days', true)
on conflict (code) do nothing;

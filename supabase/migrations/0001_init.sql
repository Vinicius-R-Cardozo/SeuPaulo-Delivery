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

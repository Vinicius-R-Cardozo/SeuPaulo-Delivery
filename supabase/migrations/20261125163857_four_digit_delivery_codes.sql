-- Somente pedidos novos recebem quatro dígitos. Os códigos emitidos continuam válidos.
create or replace function public.gen_delivery_code()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- Os primeiros 32 bits de um UUID v4 são aleatórios.
  random_value bigint := ('x' || left(gen_random_uuid()::text, 8))::bit(32)::bigint;
begin
  insert into public.order_delivery_codes(order_id, code)
  values (new.id, lpad((random_value % 10000)::text, 4, '0'))
  on conflict (order_id) do nothing;
  return new;
end;
$$;

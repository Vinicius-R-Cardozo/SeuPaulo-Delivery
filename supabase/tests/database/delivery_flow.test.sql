begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(14);

create temp table fixture as select gen_random_uuid() as customer, gen_random_uuid() as driver,
  gen_random_uuid() as other_driver, gen_random_uuid() as admin, gen_random_uuid() as trip;
insert into auth.users(id,email,raw_user_meta_data)
select u.id, u.id::text || '@example.invalid', jsonb_build_object('role',u.role)
from fixture f cross join lateral (values (f.customer,'customer'),(f.driver,'driver'),
  (f.other_driver,'driver'),(f.admin,'customer')) u(id,role);
update profiles set role='admin' where id=(select admin from fixture);
insert into drivers(id,status,online,model,color,plate)
select id,'approved',true,'Teste','Preta','QA' from fixture cross join lateral
  (values(driver),(other_driver)) as d(id);
insert into orders(id,customer_id,customer_name,code,subtotal,total,payment_method)
select trip,customer,'Teste','QA',1,1,'cash' from fixture;

do $$ begin perform set_config('request.jwt.claim.sub',(select driver::text from fixture),true); end $$;
select throws_ok($q$select advance_order(trip,'accepted') from fixture$q$, 'P0001',
  'Esta etapa não está disponível para você neste pedido.', 'pedido precisa ser confirmado');
do $$ begin perform set_config('request.jwt.claim.sub',(select admin::text from fixture),true); end $$;
select is((advance_order(trip,'confirmed')).status,'confirmed','restaurante confirma') from fixture;
do $$ begin perform set_config('request.jwt.claim.sub',(select driver::text from fixture),true); end $$;
select is((advance_order(trip,'accepted')).driver_id,driver,'aceite reserva o pedido') from fixture;
do $$ begin perform set_config('request.jwt.claim.sub',(select other_driver::text from fixture),true); end $$;
select throws_ok($q$select advance_order(trip,'accepted') from fixture$q$, 'P0001',
  'Esta etapa não está disponível para você neste pedido.', 'segundo entregador não assume a corrida');
do $$ begin perform set_config('request.jwt.claim.sub',(select driver::text from fixture),true); end $$;
select throws_ok($q$select advance_order(trip,'on_the_way') from fixture$q$, 'P0001',
  'Esta etapa não está disponível para você neste pedido.', 'saída exige chegada ao restaurante');
select is((advance_order(trip,'at_restaurant')).status,'at_restaurant','chegada persistida') from fixture;
select is((advance_order(trip,'on_the_way')).status,'on_the_way','retirada inicia o trajeto') from fixture;
create temp table tracking as select trip,delivery_tracking_ticket(trip) as ticket from fixture;
select ok(report_delivery_location(trip,ticket,-19.9,-44.2,now()),'ponto aceito durante o trajeto') from tracking;
do $$ begin perform report_delivery_location(trip,ticket,-19.8,-44.1,now()-interval '1 minute') from tracking; end $$;
select is(driver_lat,-19.9::float8,'ponto antigo não substitui posição atual') from orders where id=(select trip from fixture);
select is((advance_order(trip,'arrived')).status,'arrived','chegada ao cliente') from fixture;
select ok(not report_delivery_location(trip,ticket,0,0,now()),'rastreio revogado na chegada') from tracking;
select ok(not (confirm_delivery(trip,'incorreto')->>'ok')::boolean,'código incorreto mantém a corrida aberta') from fixture;
select ok((confirm_delivery(trip,c.code)->>'ok')::boolean,'entregador conclui com o código do cliente')
from fixture join order_delivery_codes c on c.order_id=trip;
do $$ begin perform confirm_delivery(trip,c.code) from fixture join order_delivery_codes c on c.order_id=trip; end $$;
select is(total_deliveries,1,'repetir confirmação não duplica o ganho') from drivers where id=(select driver from fixture);
select * from finish();
rollback;

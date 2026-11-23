begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select plan(18);

create temp table push_fixture as select gen_random_uuid() buyer,gen_random_uuid() courier,gen_random_uuid() offline,
  gen_random_uuid() order_id,gen_random_uuid() buyer_device,gen_random_uuid() courier_device,gen_random_uuid() offline_device;
insert into auth.users(id,email,raw_user_meta_data)
select u, u::text||'@example.invalid',jsonb_build_object('role',role)
from push_fixture f cross join lateral (values(f.buyer,'customer'),(f.courier,'driver'),(f.offline,'driver')) p(u,role);
insert into public.drivers(id,plate,model,color,status,online)
select courier,'QA','Bicicleta','Preta','approved',true from push_fixture
union all select offline,'QA','Bicicleta','Preta','approved',false from push_fixture;

select set_config('request.jwt.claim.sub',buyer::text,true) from push_fixture;
select register_app_push(buyer_device,'android',repeat('buyer',7)) from push_fixture;
select register_app_push(buyer_device,'android',repeat('buyer',7)) from push_fixture;
select set_config('request.jwt.claim.sub',courier::text,true) from push_fixture;
select register_app_push(courier_device,'ios-sandbox',repeat('courier',7)) from push_fixture;
select set_config('request.jwt.claim.sub',offline::text,true) from push_fixture;
select register_app_push(offline_device,'android',repeat('offline',7)) from push_fixture;
select set_config('request.jwt.claim.sub','',true);
select is((select count(*) from order_live.push_devices where installation=(select buyer_device from push_fixture)),1::bigint,'registro idempotente');
select ok(not has_function_privilege('authenticated','public.claim_app_push()','execute'),'somente worker lê fila');

insert into orders(id,customer_id,customer_name,code,subtotal,total,payment_method)
select order_id,buyer,'QA','#PUSHQA',20,20,'cash' from push_fixture;
select is((select count(*) from order_live.push_queue where title='Pedido recebido'),1::bigint,'checkout avisa cliente');
update orders set status='confirmed' where id=(select order_id from push_fixture);
select is((select count(*) from order_live.push_queue where title='Restaurante confirmou'),1::bigint,'confirmação avisa cliente');
select is((select count(*) from order_live.push_queue where offer_order=(select order_id from push_fixture)),1::bigint,'só entregador disponível recebe oferta');
select is((select d.user_id from order_live.push_queue q join order_live.push_devices d on d.id=q.device_id
          where q.offer_order=(select order_id from push_fixture)),(select courier from push_fixture),'entregador offline excluído');

update orders set status='accepted',driver_id=(select courier from push_fixture) where id=(select order_id from push_fixture);
select is((select count(*) from order_live.push_queue where title='Entrega atribuída'),1::bigint,'aceite avisa entregador');
update orders set status='at_restaurant' where id=(select order_id from push_fixture);
update orders set status='on_the_way' where id=(select order_id from push_fixture);
update orders set driver_lat=-19.98,driver_lng=-44.15 where id=(select order_id from push_fixture);
select is((select count(*) from order_live.push_queue where title in ('Entrega iniciada','Saiu para entrega')),2::bigint,'saída avisa os dois sem repetir no GPS');
update orders set status='arrived' where id=(select order_id from push_fixture);
select is((select count(*) from order_live.push_queue where title in ('Entregador chegou','Chegada ao cliente registrada')),2::bigint,'chegada avisa os dois');
update orders set status='cancelled' where id=(select order_id from push_fixture);
select is((select count(*) from order_live.push_queue where title in ('Pedido cancelado','Entrega cancelada')),2::bigint,'cancelamento avisa os dois');

insert into driver_applications(user_id,vehicle,status,full_name,cpf)
select courier,'bicicleta','manual_review','QA','00000000191' from push_fixture;
select is((select count(*) from order_live.push_queue where title='Cadastro de entregador recebido'),1::bigint,'envio de candidatura avisa');
update driver_applications set status='approved',admin_confirmed=false where user_id=(select courier from push_fixture);
select is((select count(*) from order_live.push_queue where title='Cadastro de entregador aprovado'),0::bigint,'aprovação provisória não avisa');
update driver_applications set admin_confirmed=true where user_id=(select courier from push_fixture);
select is((select count(*) from order_live.push_queue where title='Cadastro de entregador aprovado'),1::bigint,'aprovação manual avisa');
create temp table claimed as select * from claim_app_push();
select ok((select count(*) from claimed)>0,'fila retorna eventos pendentes');
select is((select count(*) from claimed where title='Nova entrega disponível'),0::bigint,'corrida aceita ou cancelada não emite oferta atrasada');
select is((select count(*) from claim_app_push()),0::bigint,'outro worker não reclama os mesmos eventos');
select finish_app_push(lease,'sent') from claimed limit 1;
select set_config('request.jwt.claim.sub',buyer::text,true) from push_fixture;
select unregister_app_push(buyer_device) from push_fixture;
select is((select count(*) from order_live.push_devices where user_id=(select buyer from push_fixture)),0::bigint,'logout remove registro');
select is((select count(*) from order_live.push_queue where route like '/app/%' and dedup_key like (select order_id::text||'%' from push_fixture)),0::bigint,'logout remove os eventos pendentes');
select * from finish();
rollback;

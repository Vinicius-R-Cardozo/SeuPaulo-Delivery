begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select plan(14);
create temp table fixture as select gen_random_uuid() customer,gen_random_uuid() stranger,
  gen_random_uuid() trip,gen_random_uuid() device;
insert into auth.users(id,email,raw_user_meta_data)
select u,u::text||'@example.invalid','{"role":"customer"}' from fixture f cross join lateral unnest(array[f.customer,f.stranger]) u;
insert into public.orders(id,customer_id,code,customer_name,subtotal,total,payment_method,address,eta_minutes)
select trip,customer,'#QA','Teste',1,1,'cash','{"lat":-19.947,"lng":-44.213}',30 from fixture;
select set_config('request.jwt.claim.sub',stranger::text,true) from fixture;
select is((select count(*) from customer_live_orders()),0::bigint,'outro cliente não lê o pedido');
select throws_ok($q$select register_order_live(trip,device,'android',repeat('a',24)) from fixture$q$,
  'P0001','Pedido indisponível','outro cliente não vincula seu aparelho');
select ok(not has_function_privilege('authenticated','claim_order_live()','execute'),'fila privada');
select set_config('request.jwt.claim.sub',customer::text,true) from fixture;
select is((select s->>'title' from customer_live_orders() s),'Pedido recebido','inicia recebido');
select register_order_live(trip,device,'android',repeat('a',24)) from fixture;
select register_order_live(trip,device,'android',repeat('a',24)) from fixture;
create temp table job as select * from claim_order_live();
select is((select count(*) from job),1::bigint,'registro repetido produz um envio');
select is((select count(*) from claim_order_live()),0::bigint,'segundo worker não assume o envio');
update orders set status='on_the_way', driver_lat=-19.95993,driver_lng=-44.199979 where id=(select trip from fixture);
select finish_order_live(lease,revision,'sent') from job;
truncate job;
insert into job select * from claim_order_live();
select is((select state->>'eta' from job),'6','GPS altera previsão durante envio em andamento');
select finish_order_live(lease,revision,'sent') from job;
update orders set driver_lat=-19.95994 where id=(select trip from fixture);
select is((select count(*) from claim_order_live()),0::bigint,'mesma previsão não envia novo push');
select rotate_order_live_android(device,repeat('a',24),repeat('b',24)) from fixture;
truncate job;
insert into job select * from claim_order_live();
select is((select token from job),repeat('b',24),'token rotacionado recebe estado atual');
select finish_order_live(lease,revision,'retry') from job;
select is((select count(*) from claim_order_live()),0::bigint,'falha temporária aguarda nova tentativa');
update orders set status='cancelled' where id=(select trip from fixture);
truncate job;
insert into job select * from claim_order_live();
select is((select state->>'terminal' from job),'true','cancelamento encerra a atividade');
select finish_order_live(lease,revision,'sent') from job;
select is((select count(*) from order_live.devices),0::bigint,'encerramento confirmado remove token');
select is((select count(*) from customer_live_orders()),0::bigint,'histórico não reinicia atividade');
select is((select s->>'title' from customer_live_orders(array[(select trip from fixture)]) s),
  'Pedido cancelado','reabertura reconcilia atividade que terminou offline');
select * from finish();
rollback;

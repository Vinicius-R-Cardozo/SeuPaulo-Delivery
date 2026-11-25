begin;
select '1..1';
-- Run in a test database. Rollback includes the pairing and all orders.
create function pg_temp.check_that(result boolean, message text) returns void language plpgsql as $$
begin
  if result is not true then raise exception 'Falhou: %', message; end if;
end $$;
do $$
declare
  actor uuid := gen_random_uuid();
  delivery uuid := gen_random_uuid();
  pickup uuid := gen_random_uuid();
  job jsonb; original uuid; current_job uuid; token text := gen_random_uuid()::text;
begin
  insert into auth.users(id,email,raw_user_meta_data)
    values(actor,actor::text||'@example.invalid','{}');
  update public.profiles set role='admin' where id=actor;
  perform set_config('request.jwt.claim.sub',actor::text,true);
  perform public.accept_legal_documents(
    (select revision from legal_internal.current_documents() where kind='terms'),
    (select revision from legal_internal.current_documents() where kind='privacy'));
  insert into kitchen_print.device(secret_hash) values(encode(sha256(convert_to(token,'UTF8')),'hex'))
    on conflict(singleton) do update set secret_hash=excluded.secret_hash;
  perform set_config('request.headers',jsonb_build_object('x-kitchen-key',token)::text,true);
  insert into public.orders(id,customer_id,code,customer_name,subtotal,total,payment_method,fulfillment)
    values(delivery,actor,'#QA1','QA',1,1,'cash','delivery'),(pickup,actor,'#QA2','QA',1,1,'cash','pickup');
  perform public.advance_order(pickup,'confirmed');
  perform pg_temp.check_that(public.claim_kitchen_ticket() is null,'retirada e delivery recebido ficam fora');
  perform public.advance_order(delivery,'confirmed');
  original := (public.kitchen_ticket_status(delivery)->>'id')::uuid;
  perform pg_temp.check_that(not exists(select from public.kitchen_order_alerts() where order_id=delivery),'comanda nova sem aviso');
  update kitchen_print.jobs set created_at=now()-interval '30 seconds' where id=original;
  perform pg_temp.check_that(exists(select from public.kitchen_order_alerts() where order_id=delivery and kind='delayed'),'fila atrasada');
  update kitchen_print.jobs set created_at=now() where id=original;
  job := public.claim_kitchen_ticket();
  perform pg_temp.check_that(job->'ticket'->>'code'='#QA1' and job->>'copy'='0','original após aceite');
  perform pg_temp.check_that(public.claim_kitchen_ticket() is null,'reserva exclusiva');
  perform pg_temp.check_that(public.update_kitchen_ticket((job->>'lease')::uuid,'retry','tcp_refused'),'falha anterior ao envio');
  perform pg_temp.check_that(exists(select from public.kitchen_order_alerts()
    where order_id=delivery and kind='delayed' and failure_code='tcp_refused'),'lista identifica a falha imediatamente');
  perform pg_temp.check_that(public.kitchen_ticket_status(delivery)->>'failure_code'='tcp_refused','detalhe identifica a falha');
  perform pg_temp.check_that(public.claim_kitchen_ticket() is null,'espera antes da próxima tentativa');
  update kitchen_print.jobs set available_at=now() where id=original;
  job := public.claim_kitchen_ticket();
  perform pg_temp.check_that(public.update_kitchen_ticket((job->>'lease')::uuid,'begin'),'início autorizado');
  perform pg_temp.check_that(public.kitchen_ticket_status(delivery)->>'failure_code' is null,'início limpa erro anterior');
  perform pg_temp.check_that(not exists(select from public.kitchen_order_alerts() where order_id=delivery),'envio dentro do prazo');
  perform pg_temp.check_that(not public.update_kitchen_ticket((job->>'lease')::uuid,'begin'),'início único');
  update kitchen_print.jobs set available_at=now() where id=original;
  perform pg_temp.check_that(public.claim_kitchen_ticket() is null,'envio incerto nunca repete sozinho');
  perform pg_temp.check_that(public.kitchen_ticket_status(delivery) @> '{"state":"review","failure_code":"confirmation_timeout"}',
    'painel pede conferência por falta de confirmação');
  perform pg_temp.check_that(exists(select from public.kitchen_order_alerts() where order_id=delivery and kind='review'),'lista pede conferência');
  perform pg_temp.check_that(public.reprint_kitchen_ticket(delivery,original),'segunda via manual');
  perform pg_temp.check_that(not exists(select from public.kitchen_order_alerts() where order_id=delivery),'via anterior não mantém aviso');
  perform pg_temp.check_that(not public.reprint_kitchen_ticket(delivery,original),'dois cliques geram uma segunda via');
  job := public.claim_kitchen_ticket();
  perform pg_temp.check_that(job->>'copy'='1','reimpressão identificada');
  current_job := (public.kitchen_ticket_status(delivery)->>'id')::uuid;
  perform public.advance_order(delivery,'cancelled','Teste');
  perform pg_temp.check_that(not public.update_kitchen_ticket((job->>'lease')::uuid,'begin'),'cancelamento invalida reserva');
  perform pg_temp.check_that(not public.reprint_kitchen_ticket(delivery,current_job),'pedido encerrado');
  perform set_config('request.headers','{}',true);
  begin
    perform public.claim_kitchen_ticket();
    raise exception 'Aceitou agente sem chave';
  exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
  begin
    perform public.kitchen_order_alerts();
    raise exception 'Expôs os avisos fora do admin';
  exception when insufficient_privilege then null; end;
  begin
    perform public.kitchen_ticket_status(delivery);
    raise exception 'Expôs a comanda fora do admin';
  exception when insufficient_privilege then null; end;
end $$;
select 'ok 1 - entrega, reserva, reimpressão, cancelamento e permissões';
rollback;

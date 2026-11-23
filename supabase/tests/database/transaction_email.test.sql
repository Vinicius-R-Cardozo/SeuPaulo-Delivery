begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select plan(15);
create temp table mail_fixture as select gen_random_uuid() buyer,gen_random_uuid() courier,gen_random_uuid() order_id;
insert into auth.users(id,email,raw_user_meta_data,email_confirmed_at)
select buyer,buyer||'@example.invalid','{"role":"customer"}'::jsonb,null::timestamptz from mail_fixture
union all select courier,courier||'@example.invalid','{"role":"driver"}'::jsonb,now() from mail_fixture;
insert into public.signup_verifications(email,user_id,code_hash,expires_at)
select buyer||'@example.invalid',buyer,repeat('0',64),now()+interval '5 minutes' from mail_fixture;

select is((select count(*) from order_live.email_queue),0::bigint,'envio do código ainda não confirma cadastro');
update public.signup_verifications set consumed=true where user_id=(select buyer from mail_fixture);
select is((select count(*) from order_live.email_queue),0::bigint,'confirmação ainda precisa ser gravada no Auth');
update auth.users set email_confirmed_at=now() where id=(select buyer from mail_fixture);
select is((select count(*) from order_live.email_queue where kind='customer_verified'),1::bigint,'confirmação do cadastro gera e-mail');
update public.profiles set customer_enabled=true where id=(select courier from mail_fixture);
select is((select count(*) from order_live.email_queue where kind='customer_verified'),2::bigint,'entregador que ativou cliente também é avisado');

insert into orders(id,customer_id,customer_name,customer_phone,address,code,subtotal,total,payment_method,fulfillment,items)
select order_id,buyer,'QA','Telefone privado','{"street":"Endereço privado"}','#MAILQA',30,30,'cash','pickup',
  '[{"product":{"name":"Item <b>QA</b>"},"unitPrice":30,"quantity":1,"notes":"Nota privada"}]'
from mail_fixture;
select is((select count(*) from order_live.email_queue where kind='order_received'),1::bigint,'pedido novo enfileira resumo');
select ok((select not (content ? 'address' or content ? 'customer_phone') and content #>> '{items,0,notes}' is null
 from order_live.email_queue where kind='order_received'),'resumo omite endereço e dados particulares');
select set_config('app.confirm_delivery','on',true);
update orders set status='delivered' where id=(select order_id from mail_fixture);
update orders set status='delivered' where id=(select order_id from mail_fixture);
select is((select count(*) from order_live.email_queue where kind='order_completed'),1::bigint,'retirada concluída recebe um recibo');

insert into driver_applications(user_id,vehicle,status,full_name,cpf,email)
select courier,'bicicleta','manual_review','QA cadastro','00000000191','untrusted-application@example.invalid' from mail_fixture;
select is((select count(*) from order_live.email_queue where kind='driver_application_received'),1::bigint,'candidatura gera confirmação');
update driver_applications set status='approved',admin_confirmed=false where user_id=(select courier from mail_fixture);
select is((select count(*) from order_live.email_queue where kind='driver_approved'),0::bigint,'aprovação provisória não gera e-mail');
update driver_applications set admin_confirmed=true where user_id=(select courier from mail_fixture);
update driver_applications set status='needs_resubmission',admin_confirmed=false where user_id=(select courier from mail_fixture);
update driver_applications set status='rejected' where user_id=(select courier from mail_fixture);
select is((select count(*) from order_live.email_queue where kind='driver_approved'),1::bigint,'aprovação manual gera e-mail');
select is((select count(*) from order_live.email_queue where kind in ('driver_rejected','driver_resubmission')),2::bigint,'reprovação e reenvio separados');
select ok(not has_function_privilege('authenticated','public.claim_transaction_email()','execute'),'somente o worker acessa a fila');
create temp table claimed_mail as select * from claim_transaction_email();
select is((select email from claimed_mail where kind='driver_approved'),(select courier||'@example.invalid' from mail_fixture),'envio usa o endereço do Auth');
select is((select count(*) from claim_transaction_email()),0::bigint,'trava evita concorrência na mesma mensagem');
select finish_transaction_email(lease,'sent') from claimed_mail where kind='order_completed';
select ok((select finished_at is not null and content='{}'::jsonb from order_live.email_queue where kind='order_completed'),'confirma envio e limpa dados da mensagem');
select * from finish();
rollback;

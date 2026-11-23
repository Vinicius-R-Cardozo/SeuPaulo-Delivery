begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select plan(13);

create temp table resend_fixture as select gen_random_uuid() courier, gen_random_uuid() other_courier,
  gen_random_uuid() manager, gen_random_uuid() application, gen_random_uuid() upload_id;
grant select on resend_fixture to authenticated;
insert into auth.users(id,email,raw_user_meta_data,email_confirmed_at)
select courier,courier||'@example.invalid','{"role":"driver"}'::jsonb,now() from resend_fixture
union all select other_courier,other_courier||'@example.invalid','{"role":"driver"}',now() from resend_fixture
union all select manager,manager||'@example.invalid','{"role":"customer"}',now() from resend_fixture;
update profiles set role='admin' where id=(select manager from resend_fixture);
insert into public.drivers(id,vehicle_type,plate,model,color,status)
select courier,'moto','QA001','QA','Preta','rejected' from resend_fixture;
insert into driver_applications(id,user_id,vehicle,status,full_name,cpf,documents,reviews)
select application,courier,'moto','rejected','Motorista QA','00000000868',
  jsonb_build_array(jsonb_build_object('kind','selfie','path',courier||'/legacy/selfie.jpg'),
                    jsonb_build_object('kind','cnh_front','path',courier||'/legacy/cnh_front.jpg')),
  '[{"action":"rejected","reason":"Imagem ilegível"}]'
from resend_fixture;
insert into storage.objects(bucket_id,name,owner_id,metadata)
select 'driver-docs',courier||'/legacy/selfie.jpg',courier::text,'{"mimetype":"image/jpeg"}'::jsonb from resend_fixture
union all
select 'driver-docs',courier||'/reenvios/'||upload_id||'/cnh_front.jpg',courier::text,'{"mimetype":"image/jpeg"}'::jsonb from resend_fixture;

create function pg_temp.attempt_resend(kinds text[], stale boolean default false)
returns driver_applications language sql as $$
  select resubmit_driver_documents(f.application,
    case when stale then to_timestamp(0) else a.updated_at end,f.upload_id,kinds)
  from resend_fixture f left join driver_applications a on a.id=f.application
$$;
grant usage on schema extensions to authenticated;

set local role authenticated;
select set_config('request.jwt.claim.sub',(select courier::text from resend_fixture),true);
select throws_ok($$select pg_temp.attempt_resend(array['cnh_front'])$$,'P0001',
  'A situação do cadastro mudou. Consulte o painel antes de reenviar.','reprovação precisa ser reaberta pelo painel');
select set_config('request.jwt.claim.sub',(select manager::text from resend_fixture),true);
select lives_ok($$select review_driver_application(application,'request_resubmission','Envie a frente da CNH') from resend_fixture$$,
  'admin solicita reenvio de candidatura reprovada');
select set_config('request.jwt.claim.sub',(select other_courier::text from resend_fixture),true);
select throws_ok($$select pg_temp.attempt_resend(array['cnh_front'])$$,'P0001',
  'Cadastro indisponível.','outra conta não consegue reenviar no meu cadastro');
select set_config('request.jwt.claim.sub',(select courier::text from resend_fixture),true);
select throws_ok($$select pg_temp.attempt_resend(array['cnh_front'],true)$$,'P0001',
  'A situação do cadastro mudou. Consulte o painel antes de reenviar.','formulário antigo não pode substituir versão recente');
select throws_ok($$select pg_temp.attempt_resend(array['bike_photo'])$$,'P0001',
  'Selecione os documentos que deseja reenviar.','aceita apenas arquivos do veículo cadastrado');
select throws_ok($$select pg_temp.attempt_resend(array['cnh_front','cnh_front'])$$,'P0001',
  'Selecione os documentos que deseja reenviar.','rejeita tipo de arquivo duplicado');
select throws_ok($$select pg_temp.attempt_resend(array['vehicle_doc'])$$,'P0001',
  'Não encontramos um dos arquivos enviados. Envie as imagens novamente.','exige arquivo existente no Storage');
select is((pg_temp.attempt_resend(array['cnh_front'])).status,'manual_review','reenvio volta para análise manual');
select throws_ok($$select pg_temp.attempt_resend(array['cnh_front'])$$,'P0001',
  'A situação do cadastro mudou. Consulte o painel antes de reenviar.','reenvio repetido não duplica o registro');
with changed as (update storage.objects set metadata='{}' where bucket_id='driver-docs' returning id)
select is((select count(*) from changed),0::bigint,'arquivos da candidatura são imutáveis');
reset role;
select ok((select documents @> jsonb_build_array(jsonb_build_object('kind','selfie','path',courier||'/legacy/selfie.jpg'))
  and documents @> jsonb_build_array(jsonb_build_object('kind','cnh_front','path',courier||'/reenvios/'||upload_id||'/cnh_front.jpg'))
  and jsonb_array_length(documents)=2 from driver_applications a join resend_fixture f on a.id=f.application),
  'somente a imagem escolhida muda de caminho');
select ok((select status='manual_review' and reviews->0->>'action'='rejected'
  and reviews->-1->>'action'='resubmitted' and not admin_confirmed
  from driver_applications a join resend_fixture f on a.id=f.application),'preserva histórico sem liberar o cadastro');
select ok(exists(select 1 from notifications n join resend_fixture f on f.manager=n.user_id
  where audience='admin' and title='Documentos reenviados'),'aparece no sino do painel');
select * from finish();
rollback;

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(21);

create temp table legal_fixture as
select gen_random_uuid() as customer, gen_random_uuid() as courier, gen_random_uuid() as trip;
grant select on legal_fixture to authenticated;
grant usage on schema extensions to anon, authenticated;

insert into auth.users (id, email, raw_user_meta_data)
select u.id, u.id || '@example.invalid', jsonb_build_object('role', u.role)
from legal_fixture f cross join lateral (values (f.customer, 'customer'), (f.courier, 'driver')) u(id, role);

select is((select count(*) from legal_requirements()), 0::bigint, 'no official revision creates no renewal requirement');
select lives_ok('select validate_signup_legal_acceptance(null, null)', 'legacy signup keeps working before publication');

insert into public.orders (id, customer_id, customer_name, code, subtotal, total, payment_method)
select trip, customer, 'Teste', 'QA-OPEN', 1, 1, 'cash' from legal_fixture;

insert into public.legal_documents (kind, revision, body)
values ('terms', 1, 'Termos de teste'), ('privacy', 1, 'Política de teste');

select throws_ok('select validate_signup_legal_acceptance(null, null)', '22023',
  'Leia e confirme as versões vigentes dos documentos para continuar.', 'signup requires both official revisions');
select throws_ok('select validate_signup_legal_acceptance(1, 2)', '22023',
  'Leia e confirme as versões vigentes dos documentos para continuar.', 'signup rejects a mismatched revision');

set local role anon;
select is((select count(*) from legal_requirements() where not accepted), 2::bigint, 'guest can read requirements without account information');
select ok(not has_function_privilege('anon', 'public.accept_legal_documents(integer,integer)', 'EXECUTE'),
  'guest cannot register an acceptance');
reset role;

insert into public.signup_verifications (email, user_id, code_hash, expires_at, legal_terms_revision, legal_privacy_revision)
select customer || '@example.invalid', customer, 'test', now() + interval '5 minutes', 1, 1 from legal_fixture;
select is((select count(*) from legal_internal.acceptances), 0::bigint, 'unverified signup is not recorded as accepted');
update public.signup_verifications set consumed = true where user_id = (select customer from legal_fixture);
select is((select count(*) from legal_internal.acceptances where source = 'customer_signup'), 2::bigint,
  'email verification records exactly the revisions confirmed at signup');

select throws_ok($$update orders set driver_id = (select courier from legal_fixture) where id = (select trip from legal_fixture)$$,
  '42501', 'Confira e confirme os documentos vigentes do Seu Paulo Delivery para continuar.', 'driver without acceptance cannot take a trip');

set local role authenticated;
select set_config('request.jwt.claim.sub', (select courier::text from legal_fixture), true);
select is((select count(*) from legal_requirements() where accepted), 0::bigint, 'customer acceptance does not cover another account');
select throws_ok('select accept_legal_documents(1, null)', '22023',
  'Os documentos vigentes mudaram. Confira as versões exibidas e tente novamente.', 'cannot omit a pending policy');
select lives_ok('select accept_legal_documents(1, 1)', 'signed-in courier records both documents');
select lives_ok('select accept_legal_documents(1, 1)', 'retrying an acceptance is idempotent');
reset role;

select throws_ok($$insert into public.legal_documents (kind, revision, body) values ('privacy', 2, 'Política revisada')$$,
  '23514', null, 'a revised document requires a summary');
select throws_ok($$insert into public.legal_documents (kind, revision, body, change_summary)
  values ('privacy', 2, 'Política revisada', E' \n\t')$$, '23514', null, 'a blank summary is rejected');
insert into public.legal_documents (kind, revision, body, change_summary)
values ('privacy', 2, 'Política revisada', 'Detalhamos as notificações de pedidos.');

select lives_ok($$update orders set status = 'confirmed' where id = (select trip from legal_fixture)$$,
  'existing orders continue after a publication');
select throws_ok($$insert into orders (customer_id, customer_name, code, subtotal, total, payment_method)
  select customer, 'Teste', 'QA-NEW', 1, 1, 'cash' from legal_fixture$$,
  '42501', 'Confira e confirme os documentos vigentes do Seu Paulo Delivery para continuar.', 'new order requires the revised policy');

set local role authenticated;
select set_config('request.jwt.claim.sub', (select courier::text from legal_fixture), true);
select results_eq('select kind, revision from legal_requirements() where not accepted',
  $$values ('privacy'::text, 2)$$, 'only the changed document requires another confirmation');
select is((select changes from legal_requirements() where kind = 'privacy'),
  '[{"revision":2,"summary":"Detalhamos as notificações de pedidos."}]'::jsonb, 'the review includes the summary of the changed document');
select lives_ok('select accept_legal_documents(null, 2)', 'unchanged terms do not need another acceptance');
reset role;

insert into public.legal_documents (kind, revision, body, change_summary)
values ('privacy', 3, 'Nova política revisada', 'Explicamos como consultar os avisos de entrega.');
set local role authenticated;
select set_config('request.jwt.claim.sub', (select customer::text from legal_fixture), true);
select is((select changes from legal_requirements() where kind = 'privacy'),
  '[{"revision":2,"summary":"Detalhamos as notificações de pedidos."}, {"revision":3,"summary":"Explicamos como consultar os avisos de entrega."}]'::jsonb,
  'the review includes all missed summaries since the previous acceptance');
reset role;

select * from finish();
rollback;

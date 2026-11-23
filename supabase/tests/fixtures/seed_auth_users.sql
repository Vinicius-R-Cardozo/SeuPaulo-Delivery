-- ============================================================
-- Contas de demonstração JÁ CONFIRMADAS (senha: Senha123)
-- Cria usuários reais no Supabase Auth, contornando a confirmação de e-mail.
-- Rode no SQL Editor DEPOIS do run_all.sql. É idempotente (pula e-mails já existentes).
-- ============================================================
do $$
declare
  demo record;
  uid uuid;
begin
  for demo in
    select * from (values
      ('admin@seupaulo.com',      'Paulo Administrador', '(31) 7352-9146',  'admin'),
      ('cliente@seupaulo.com',    'Maria Cliente',       '(31) 98888-1234', 'customer'),
      ('entregador@seupaulo.com', 'João Entregador',     '(31) 97777-5678', 'driver')
    ) as t(email, full_name, phone, role)
  loop
    if exists (select 1 from auth.users where email = demo.email) then
      continue;
    end if;

    uid := gen_random_uuid();

    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data,
      confirmation_token, recovery_token, email_change_token_new, email_change
    ) values (
      '00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated',
      demo.email, crypt('Senha123', gen_salt('bf')),
      now(), now(), now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('full_name', demo.full_name, 'phone', demo.phone, 'role', demo.role),
      '', '', '', ''
    );

    insert into auth.identities (
      id, user_id, provider_id, identity_data, provider,
      last_sign_in_at, created_at, updated_at
    ) values (
      gen_random_uuid(), uid, uid::text,
      jsonb_build_object('sub', uid::text, 'email', demo.email, 'email_verified', true),
      'email', now(), now(), now()
    );

    -- O trigger handle_new_user já cria o profile; reforçamos papel/nome/telefone.
    update public.profiles
       set role = demo.role, full_name = demo.full_name, phone = demo.phone
     where id = uid;

    if demo.role = 'driver' then
      insert into public.drivers (id, vehicle_type, plate, model, color, status, online, rating, total_deliveries)
      values (uid, 'moto', 'PWA1B23', 'Honda CG 160', 'Vermelha', 'approved', true, 4.9, 342)
      on conflict (id) do nothing;
    end if;
  end loop;
end $$;

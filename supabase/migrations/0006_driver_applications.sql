-- ============================================================
-- Onboarding de entregadores: candidatura + documentos (bucket privado) +
-- triagem automática + revisão manual do admin, com auditoria e RLS.
-- Rode no SQL Editor do Supabase (depois dos anteriores). Idempotente.
-- ============================================================

-- 1) Tabela de candidaturas ---------------------------------------------------
create table if not exists public.driver_applications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  vehicle     text not null check (vehicle in ('bicicleta','moto')),
  status      text not null default 'under_analysis'
    check (status in ('pending_documents','under_analysis','manual_review',
                      'approved','rejected','needs_resubmission')),
  full_name   text not null,
  cpf         text not null,
  rg          text,
  birth_date  text,
  email       text,
  phone       text,
  address     jsonb not null default '{}'::jsonb,
  cnh         jsonb,
  moto        jsonb,
  bike        jsonb,
  documents   jsonb not null default '[]'::jsonb,   -- [{kind,path,uploadedAt,ocr}]
  auto_analysis jsonb,                              -- resultado da triagem
  reviews     jsonb not null default '[]'::jsonb,   -- histórico/auditoria
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- CPF único (comparando só os dígitos): impede dois cadastros com o mesmo CPF.
create unique index if not exists driver_applications_cpf_key
  on public.driver_applications ((regexp_replace(cpf, '\D', '', 'g')));
create index if not exists driver_applications_user_idx on public.driver_applications(user_id);
create index if not exists driver_applications_status_idx on public.driver_applications(status);

alter table public.driver_applications enable row level security;

-- Leitura: o dono vê a própria; o admin vê todas.
drop policy if exists "apps: dono/admin leem" on public.driver_applications;
create policy "apps: dono/admin leem" on public.driver_applications
  for select using (user_id = auth.uid() or public.is_admin());

-- Inserção: só o próprio usuário e NUNCA já aprovado/reprovado — a decisão é do
-- admin, via review_driver_application (SECURITY DEFINER).
drop policy if exists "apps: dono cria" on public.driver_applications;
create policy "apps: dono cria" on public.driver_applications
  for insert with check (
    user_id = auth.uid()
    and status in ('pending_documents','under_analysis','manual_review','needs_resubmission')
  );
-- Sem policy de UPDATE/DELETE: mudanças de status só pela RPC de revisão.

-- 2) Impede o entregador de mudar o próprio status (auto-aprovação) ------------
create or replace function public.guard_driver_status()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from old.status and not public.is_admin() then
    raise exception 'Somente a administração pode alterar o status do entregador.';
  end if;
  return new;
end $$;

drop trigger if exists trg_guard_driver_status on public.drivers;
create trigger trg_guard_driver_status before update on public.drivers
  for each row execute function public.guard_driver_status();

-- 3) Revisão do admin (aprovar / reprovar / pedir reenvio) --------------------
create or replace function public.review_driver_application(
  p_id uuid, p_action text, p_reason text default null
) returns json language plpgsql security definer set search_path = public as $$
declare
  v_app    public.driver_applications%rowtype;
  v_status text;
  v_action text;
  v_review jsonb;
begin
  if not public.is_admin() then
    raise exception 'Apenas administradores podem revisar cadastros.';
  end if;

  select * into v_app from public.driver_applications where id = p_id;
  if not found then raise exception 'Solicitação não encontrada.'; end if;

  v_status := case p_action
    when 'approve' then 'approved'
    when 'reject' then 'rejected'
    when 'request_resubmission' then 'needs_resubmission'
    else null end;
  if v_status is null then raise exception 'Ação inválida.'; end if;

  if p_action <> 'approve' and coalesce(btrim(p_reason), '') = '' then
    raise exception 'Informe o motivo da decisão.';
  end if;

  v_action := case p_action
    when 'approve' then 'approved'
    when 'reject' then 'rejected'
    else 'resubmission_requested' end;

  v_review := jsonb_build_object(
    'at', now(),
    'by', auth.uid(),
    'action', v_action,
    'status', v_status,
    'reason', nullif(btrim(coalesce(p_reason, '')), '')
  );

  update public.driver_applications
     set status = v_status,
         reviews = reviews || v_review,
         updated_at = now()
   where id = p_id
   returning * into v_app;

  update public.drivers
     set status = case v_status
                    when 'approved' then 'approved'
                    when 'rejected' then 'rejected'
                    else 'pending' end
   where id = v_app.user_id;

  insert into public.notifications (user_id, audience, title, body)
  values (
    v_app.user_id, 'driver', 'Status do cadastro atualizado',
    case v_status
      when 'approved' then 'Cadastro aprovado! Você já pode receber entregas.'
      when 'rejected' then trim('Cadastro reprovado. ' || coalesce(p_reason, ''))
      else trim('Precisamos de um novo envio. ' || coalesce(p_reason, '')) end
  );

  return row_to_json(v_app);
end $$;

grant execute on function public.review_driver_application(uuid, text, text) to authenticated;

-- 4) Notifica o admin quando chega uma nova candidatura ----------------------
create or replace function public.notify_new_application()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.notifications (user_id, audience, title, body)
  select p.id, 'admin', 'Nova solicitação de entregador',
         new.full_name || ' (' || (case new.vehicle when 'moto' then 'Moto' else 'Bicicleta' end)
           || ') enviou o cadastro.'
  from public.profiles p where p.role = 'admin';
  return new;
end $$;

drop trigger if exists trg_notify_new_application on public.driver_applications;
create trigger trg_notify_new_application after insert on public.driver_applications
  for each row execute function public.notify_new_application();

-- 5) Bucket privado dos documentos + acesso restrito -------------------------
insert into storage.buckets (id, name, public)
values ('driver-docs', 'driver-docs', false)
on conflict (id) do nothing;

-- Cada usuário só grava na SUA pasta (prefixo = id do usuário).
drop policy if exists "driver-docs: dono envia" on storage.objects;
create policy "driver-docs: dono envia" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'driver-docs' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "driver-docs: dono atualiza" on storage.objects;
create policy "driver-docs: dono atualiza" on storage.objects
  for update to authenticated
  using (bucket_id = 'driver-docs' and (storage.foldername(name))[1] = auth.uid()::text);

-- Leitura só do dono ou do admin (documentos pessoais nunca são públicos).
drop policy if exists "driver-docs: dono/admin leem" on storage.objects;
create policy "driver-docs: dono/admin leem" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'driver-docs'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
  );

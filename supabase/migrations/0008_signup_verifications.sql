-- ============================================================
-- Verificação de e-mail no cadastro do cliente: código de 6 dígitos guardado
-- como HASH, com expiração de 5 min. A geração/validação e o envio do e-mail
-- ficam na Edge Function `signup-code` (service role + Resend). O cliente NUNCA
-- lê esta tabela. Rode no SQL Editor (idempotente).
-- ============================================================

create table if not exists public.signup_verifications (
  email      text primary key,
  attempt_id uuid not null default gen_random_uuid(),
  code_hash  text not null,            -- SHA-256 de (email:código) — nunca o código
  user_id    uuid,                     -- conta criada (não confirmada) aguardando verificação
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  consumed   boolean not null default false,
  attempts   int not null default 0
);

alter table public.signup_verifications enable row level security;
-- Sem NENHUMA policy: apenas a Edge Function (service role) acessa.
revoke all on public.signup_verifications from anon, authenticated;

-- Status de um e-mail no Auth (existe? confirmado?) — usado pela Edge Function
-- para diferenciar "já cadastrado" de "cadastro pendente" (reenvio).
create or replace function public.auth_user_status(p_email text)
returns table (id uuid, confirmed boolean)
language sql security definer set search_path = public, auth as $$
  select u.id, u.email_confirmed_at is not null
  from auth.users u
  where lower(u.email) = lower(p_email)
  limit 1;
$$;

revoke all on function public.auth_user_status(text) from anon, authenticated;
grant execute on function public.auth_user_status(text) to service_role;

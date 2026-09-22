-- ============================================================
-- Auto-aprovação PROVISÓRIA do entregador + mini-aprovação do admin.
-- Se os critérios verificáveis batem (documentos enviados, CNH na validade e
-- categoria de moto, placa), o servidor libera o entregador na hora; o admin
-- ainda confirma depois (mini-aprovação) e pode reprovar/bloquear.
-- Rode no SQL Editor DEPOIS do 0006. Idempotente.
-- ============================================================

-- 1) Flag de confirmação do admin -------------------------------------------
alter table public.driver_applications
  add column if not exists admin_confirmed boolean not null default false;

-- 2) Guard do status do entregador: além do admin, permitir a RPC de triagem
--    (que roda como o próprio entregador, mas é SECURITY DEFINER e reconfere
--    os dados no servidor). Fora isso, ninguém muda o próprio status.
create or replace function public.guard_driver_status()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from old.status
     and not public.is_admin()
     and current_setting('app.driver_screen', true) is distinct from 'on' then
    raise exception 'Somente a administração pode alterar o status do entregador.';
  end if;
  return new;
end $$;

-- 3) Auto-aprovação: o SERVIDOR reconfere os dados guardados (nada vem do
--    cliente). Passou -> aprova provisório (admin_confirmed = false). Senão,
--    mantém em revisão manual. Nunca reprova aqui.
create or replace function public.auto_approve_application(p_id uuid)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_app  public.driver_applications%rowtype;
  v_ok   boolean := true;
  v_exp  date;
begin
  select * into v_app
    from public.driver_applications
   where id = p_id and user_id = auth.uid();
  if not found then raise exception 'Solicitação não encontrada.'; end if;

  -- Só faz sentido promover algo que está em análise.
  if v_app.status not in ('under_analysis', 'manual_review') then
    return row_to_json(v_app);
  end if;

  -- Documentos obrigatórios por tipo de veículo.
  if v_app.vehicle = 'moto' then
    if not (v_app.documents @> '[{"kind":"selfie"}]'::jsonb
        and v_app.documents @> '[{"kind":"id_document"}]'::jsonb
        and v_app.documents @> '[{"kind":"cnh_front"}]'::jsonb
        and v_app.documents @> '[{"kind":"cnh_back"}]'::jsonb
        and v_app.documents @> '[{"kind":"vehicle_doc"}]'::jsonb
        and v_app.documents @> '[{"kind":"vehicle_photo"}]'::jsonb
        and v_app.documents @> '[{"kind":"plate_photo"}]'::jsonb) then
      v_ok := false;
    end if;
    -- Categoria habilita moto.
    if coalesce(upper(v_app.cnh->>'category'), '') !~ '^A' then v_ok := false; end if;
    -- Validade da CNH (DD/MM/AAAA) no futuro.
    begin
      v_exp := to_date(v_app.cnh->>'expiresAt', 'DD/MM/YYYY');
    exception when others then v_exp := null; end;
    if v_exp is null or v_exp < current_date then v_ok := false; end if;
    -- Placa informada.
    if coalesce(v_app.moto->>'plate', '') = '' then v_ok := false; end if;
  else
    if not (v_app.documents @> '[{"kind":"selfie"}]'::jsonb
        and v_app.documents @> '[{"kind":"id_document"}]'::jsonb
        and v_app.documents @> '[{"kind":"bike_photo"}]'::jsonb) then
      v_ok := false;
    end if;
  end if;

  if not v_ok then
    return row_to_json(v_app);  -- segue em revisão manual
  end if;

  -- Promove: aprovado provisório, aguardando a mini-aprovação do admin.
  update public.driver_applications
     set status = 'approved',
         admin_confirmed = false,
         reviews = reviews || jsonb_build_object(
           'at', now(), 'by', 'auto', 'action', 'approved',
           'status', 'approved', 'reason', 'Aprovação automática (provisória) — aguarda confirmação do admin.'
         ),
         updated_at = now()
   where id = p_id
   returning * into v_app;

  perform set_config('app.driver_screen', 'on', true);
  update public.drivers set status = 'approved' where id = v_app.user_id;

  insert into public.notifications (user_id, audience, title, body)
  select p.id, 'admin', 'Entregador liberado — confirmar',
         v_app.full_name || ' passou na triagem e já está operando. Confirme o cadastro.'
  from public.profiles p where p.role = 'admin';

  return row_to_json(v_app);
end $$;

grant execute on function public.auto_approve_application(uuid) to authenticated;

-- 4) Revisão do admin: aprovar / CONFIRMAR (mini-aprovação) / reprovar / reenvio
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
    when 'confirm' then 'approved'
    when 'reject' then 'rejected'
    when 'request_resubmission' then 'needs_resubmission'
    else null end;
  if v_status is null then raise exception 'Ação inválida.'; end if;

  if p_action in ('reject', 'request_resubmission')
     and coalesce(btrim(p_reason), '') = '' then
    raise exception 'Informe o motivo da decisão.';
  end if;

  v_action := case p_action
    when 'reject' then 'rejected'
    when 'request_resubmission' then 'resubmission_requested'
    else 'approved' end;

  v_review := jsonb_build_object(
    'at', now(), 'by', auth.uid(), 'action', v_action, 'status', v_status,
    'reason', coalesce(
      nullif(btrim(coalesce(p_reason, '')), ''),
      case when p_action = 'confirm' then 'Aprovação confirmada pelo administrador.' else null end
    )
  );

  update public.driver_applications
     set status = v_status,
         admin_confirmed = case when p_action in ('approve', 'confirm') then true else admin_confirmed end,
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

  -- 'confirm' não muda a situação do entregador (já estava operando) — não avisa.
  if p_action <> 'confirm' then
    insert into public.notifications (user_id, audience, title, body)
    values (
      v_app.user_id, 'driver', 'Status do cadastro atualizado',
      case v_status
        when 'approved' then 'Cadastro aprovado! Você já pode receber entregas.'
        when 'rejected' then trim('Cadastro reprovado. ' || coalesce(p_reason, ''))
        else trim('Precisamos de um novo envio. ' || coalesce(p_reason, '')) end
    );
  end if;

  return row_to_json(v_app);
end $$;

grant execute on function public.review_driver_application(uuid, text, text) to authenticated;

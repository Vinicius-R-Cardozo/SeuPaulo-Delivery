begin;
select '1..1';
do $$
declare actor uuid:=gen_random_uuid(); sid uuid:=gen_random_uuid(); grant_key text:=gen_random_uuid()::text;
  device_key text:=repeat('a',64); code text; test_id uuid:=gen_random_uuid(); result jsonb;
begin
  insert into auth.users(id,email,raw_user_meta_data) values(actor,actor::text||'@example.invalid','{}');
  update public.profiles set role='admin' where id=actor;
  perform set_config('request.jwt.claim.sub',actor::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'session_id',sid)::text,true);
  begin
    perform public.kitchen_printer_settings('invalid');
    raise exception 'Admin entrou sem desbloquear';
  exception when insufficient_privilege then null; end;
  for i in 1..5 loop
    result:=public.unlock_kitchen_settings('invalid');
  end loop;
  if result->>'blocked' is distinct from 'true' then raise exception 'Faltou limite de tentativas'; end if;
  -- Issue a fixture grant so this test never embeds the restaurant PIN.
  insert into kitchen_print.access_grants values(sha256(convert_to(grant_key,'UTF8')),actor,sid::text,now()+interval '1 minute');
  code:=public.invite_kitchen_computer(grant_key);
  perform set_config('request.headers',jsonb_build_object('x-kitchen-key',device_key)::text,true);
  perform public.connect_kitchen_computer(code,'QA');
  begin
    perform public.connect_kitchen_computer(code,'Outro');
    raise exception 'Reutilizou convite';
  exception when raise_exception then
    if sqlerrm <> 'Código inválido ou expirado' then raise; end if;
  end;
  perform public.kitchen_heartbeat(array['Cozinha']);
  perform public.save_kitchen_printer(grant_key,'{"mode":"windows","queue":"Cozinha"}',false);
  perform public.test_kitchen_printer(grant_key,test_id);
  perform public.test_kitchen_printer(grant_key,test_id);
  result:=public.claim_kitchen_ticket();
  if result#>>'{ticket,code}' is distinct from '#TESTE' or result#>>'{destination,queue}' is distinct from 'Cozinha' then
    raise exception 'Teste físico sem destino correto';
  end if;
  if not public.cancel_kitchen_test(grant_key,test_id) then raise exception 'Reserva não cancelada'; end if;
  if public.update_kitchen_ticket((result->>'lease')::uuid,'begin') then raise exception 'Imprimiu teste cancelado'; end if;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'session_id',gen_random_uuid())::text,true);
  begin
    perform public.kitchen_printer_settings(grant_key);
    raise exception 'Outra sessão reutilizou desbloqueio';
  exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'session_id',sid)::text,true);
  perform public.disconnect_kitchen_computer(grant_key);
  begin
    perform public.claim_kitchen_ticket();
    raise exception 'Computador revogado consumiu fila';
  exception when insufficient_privilege then null; end;
  perform public.lock_kitchen_settings(grant_key);
  begin
    perform public.kitchen_printer_settings(grant_key);
    raise exception 'Desbloqueio continuou após bloqueio';
  exception when insufficient_privilege then null; end;
end $$;
select 'ok 1 - proteção da configuração, pareamento único, teste físico e revogação';
rollback;

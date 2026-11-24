alter table kitchen_print.device
  add column managed boolean not null default false,
  add column enabled boolean not null default true,
  add column destination jsonb,
  add column machine text,
  add column last_seen timestamptz,
  add column queues text[] not null default '{}';
create table kitchen_print.invitation (
  singleton boolean primary key default true check(singleton),
  digest bytea not null, expires_at timestamptz not null
);
alter table kitchen_print.jobs alter column order_id drop not null;
alter table kitchen_print.jobs add column created_at timestamptz not null default now();
create index kitchen_print_tests on kitchen_print.jobs(created_at desc) where order_id is null;

create table kitchen_print.pin_attempts (
  admin_id uuid primary key references public.profiles(id) on delete cascade,
  failures integer not null default 0, blocked_until timestamptz
);
create table kitchen_print.access_grants (
  digest bytea primary key, admin_id uuid not null references public.profiles(id) on delete cascade,
  session_id text not null, expires_at timestamptz not null
);
create index kitchen_access_expiry on kitchen_print.access_grants(expires_at);

-- pgcrypto may live in public or extensions, depending on the installation.
do $install$
declare ns name;
begin
  select n.nspname into strict ns from pg_extension e join pg_namespace n on n.oid=e.extnamespace where e.extname='pgcrypto';
  execute format($fn$
    create function kitchen_print.pin_matches(value text) returns boolean language sql
    set search_path='' as $body$ select %I.crypt(value,%L)=%L $body$
  $fn$,ns,'$2a$10$Pbbqlln.0lisufJK86sQeOYHuzhj8Rcd0b2VQTvdBXJoTe8R610di',
    '$2a$10$Pbbqlln.0lisufJK86sQeOYHuzhj8Rcd0b2VQTvdBXJoTe8R610di');
end $install$;

create function public.unlock_kitchen_settings(p_pin text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid := auth.uid(); session_key text := current_setting('request.jwt.claims',true)::jsonb->>'session_id';
  attempt kitchen_print.pin_attempts; token text;
begin
  if public.is_admin() is not true or nullif(session_key,'') is null then raise insufficient_privilege; end if;
  insert into kitchen_print.pin_attempts(admin_id) values(actor) on conflict do nothing;
  select * into strict attempt from kitchen_print.pin_attempts where admin_id=actor for update;
  if attempt.blocked_until>now() then return jsonb_build_object('blocked',true); end if;
  if p_pin is null or p_pin !~ '^[0-9]{4}$' or not kitchen_print.pin_matches(p_pin) then
    update kitchen_print.pin_attempts set failures=(failures+1)%5,
      blocked_until=case when failures>=4 then now()+interval '10 minutes' end
      where admin_id=actor returning * into attempt;
    return jsonb_build_object('blocked',attempt.blocked_until is not null);
  end if;
  update kitchen_print.pin_attempts set failures=0,blocked_until=null where admin_id=actor;
  delete from kitchen_print.access_grants where expires_at<=now();
  token := gen_random_uuid()::text;
  insert into kitchen_print.access_grants values(sha256(convert_to(token,'UTF8')),actor,session_key,now()+interval '15 minutes');
  return jsonb_build_object('access',token);
end $$;
revoke all on function public.unlock_kitchen_settings(text),kitchen_print.pin_matches(text) from public,anon,authenticated;
grant execute on function public.unlock_kitchen_settings(text) to authenticated;

create function public.lock_kitchen_settings(p_access text) returns void
language sql security definer set search_path='' as $$
  delete from kitchen_print.access_grants where digest=sha256(convert_to(p_access,'UTF8'))
    and admin_id=auth.uid() and session_id=current_setting('request.jwt.claims',true)::jsonb->>'session_id'
$$;
revoke all on function public.lock_kitchen_settings(text) from public,anon,authenticated;
grant execute on function public.lock_kitchen_settings(text) to authenticated;

create function kitchen_print.require_admin(p_access text) returns void
language plpgsql stable security definer set search_path='' as $$
begin
  if public.is_admin() is not true or not exists(select from kitchen_print.access_grants
    where digest=sha256(convert_to(p_access,'UTF8')) and admin_id=auth.uid() and expires_at>now()
    and session_id=current_setting('request.jwt.claims',true)::jsonb->>'session_id') then
    raise exception 'Desbloqueie as configurações.' using errcode='42501';
  end if;
end $$;

create function public.invite_kitchen_computer(p_access text) returns text
language plpgsql security definer set search_path='' as $$
declare code text := gen_random_uuid()::text;
begin
  perform kitchen_print.require_admin(p_access);
  insert into kitchen_print.invitation(digest,expires_at)
    values(sha256(convert_to(code,'UTF8')), now()+interval '15 minutes')
    on conflict(singleton) do update set digest=excluded.digest,expires_at=excluded.expires_at;
  return code;
end $$;

create function public.connect_kitchen_computer(p_code text,p_machine text) returns void
language plpgsql security definer set search_path='' as $$
declare token text := current_setting('request.headers',true)::jsonb->>'x-kitchen-key';
begin
  if token is null or token !~ '^[0-9a-f]{64}$' then raise insufficient_privilege; end if;
  delete from kitchen_print.invitation where expires_at>now() and digest=sha256(convert_to(p_code,'UTF8'));
  if not found then raise exception 'Código inválido ou expirado'; end if;
  insert into kitchen_print.device(secret_hash,managed,enabled,machine)
    values(encode(sha256(convert_to(token,'UTF8')),'hex'),true,false,left(p_machine,100))
    on conflict(singleton) do update set secret_hash=excluded.secret_hash,managed=true,enabled=false,
      machine=excluded.machine,last_seen=null,destination=null,queues='{}';
  update kitchen_print.jobs set state='cancelled',lease=null where order_id is null and state in ('pending','reserved');
end $$;

create function public.kitchen_heartbeat(p_queues text[]) returns void
language plpgsql security definer set search_path='' as $$
begin
  perform kitchen_print.verify_device();
  update kitchen_print.device set last_seen=now(), queues=array(select distinct left(q,250)
    from unnest(p_queues) q where q<>'' order by 1 limit 256);
end $$;

create function public.kitchen_printer_settings(p_access text) returns jsonb language plpgsql stable
security definer set search_path='' as $$
declare d kitchen_print.device; t kitchen_print.jobs;
begin
  perform kitchen_print.require_admin(p_access);
  select * into d from kitchen_print.device;
  select * into t from kitchen_print.jobs where order_id is null order by created_at desc limit 1;
  return jsonb_build_object('paired',d.singleton is true,'managed',coalesce(d.managed,false),
    'enabled',coalesce(d.enabled,false),'destination',d.destination,'machine',d.machine,'last_seen',d.last_seen,
    'online',coalesce(d.last_seen > now()-interval '45 seconds',false),'queues',coalesce(d.queues,'{}'::text[]),
    'test',case when t.id is not null then jsonb_build_object('id',t.id,'at',t.created_at,'destination',t.ticket->'destination','state',case
      when t.state='sending' and t.available_at<=now() then 'review'
      when t.retrying and t.state in ('pending','reserved') then 'retry' else t.state end) end);
end $$;

create function public.save_kitchen_printer(p_access text,p_destination jsonb,p_enabled boolean) returns void
language plpgsql security definer set search_path='' as $$
declare d kitchen_print.device; dest jsonb; addr inet; port int; queue text;
begin
  perform kitchen_print.require_admin(p_access);
  select * into d from kitchen_print.device for update;
  if d.managed is not true then raise exception 'Conecte o computador da cozinha.'; end if;
  if p_destination->>'mode'='windows' then
    queue := p_destination->>'queue';
    if queue is null or (not (queue=any(d.queues)) and queue is distinct from d.destination->>'queue') then
      raise exception 'Selecione uma fila deste computador.'; end if;
    dest := jsonb_build_object('mode','windows','queue',queue);
  elsif p_destination->>'mode'='tcp' then
    addr := (p_destination->>'host')::inet;
    port := (p_destination->>'port')::integer;
    if addr is null or masklen(addr)<>32 or not (addr <<= inet '10.0.0.0/8' or addr <<= inet '172.16.0.0/12'
      or addr <<= inet '192.168.0.0/16') or port is null or port not between 1 and 65535 then
      raise exception 'Informe um IPv4 privado da rede local e uma porta válida.'; end if;
    dest := jsonb_build_object('mode','tcp','host',host(addr),'port',port);
  else raise exception 'Escolha a conexão da impressora.'; end if;
  if dest is distinct from d.destination then
    update kitchen_print.jobs set state='cancelled',lease=null where order_id is null and state in ('pending','reserved');
  end if;
  update kitchen_print.device set destination=dest, enabled=p_enabled;
end $$;

create function public.test_kitchen_printer(p_access text,p_id uuid) returns void language plpgsql
security definer set search_path='' as $$
declare d kitchen_print.device;
begin
  perform kitchen_print.require_admin(p_access);
  select * into d from kitchen_print.device for update;
  if d.destination is null or d.last_seen is null or d.last_seen < now()-interval '45 seconds' then
    raise exception 'Salve o destino e conecte o computador antes do teste.'; end if;
  if exists(select from kitchen_print.jobs where id=p_id and order_id is null) then return; end if;
  if exists(select from kitchen_print.jobs where order_id is null and
    (state in ('pending','reserved') or (state='sending' and available_at>now()))) then
    raise exception 'Já existe um teste em andamento.'; end if;
  insert into kitchen_print.jobs(id,ticket) values(p_id,jsonb_build_object(
    'code','#TESTE','destination',d.destination,'ordered_at',to_char(now() at time zone 'America/Sao_Paulo','DD/MM HH24:MI'),
    'items',jsonb_build_array(jsonb_build_object('quantity',1,'product',jsonb_build_object('name','TESTE - NAO PREPARAR'),
    'addons',jsonb_build_array(jsonb_build_object('optionName','Adicional de teste')),'notes','Conferir texto e corte do papel.'))));
end $$;

create function public.cancel_kitchen_test(p_access text,p_id uuid) returns boolean language plpgsql
security definer set search_path='' as $$
begin
  perform kitchen_print.require_admin(p_access);
  update kitchen_print.jobs set state='cancelled',lease=null where id=p_id and order_id is null and state in ('pending','reserved');
  return found;
end $$;

create function public.disconnect_kitchen_computer(p_access text) returns void language plpgsql
security definer set search_path='' as $$
begin
  perform kitchen_print.require_admin(p_access);
  delete from kitchen_print.invitation;
  delete from kitchen_print.device;
  update kitchen_print.jobs set state='cancelled',lease=null where order_id is null and state in ('pending','reserved');
end $$;
revoke all on function public.disconnect_kitchen_computer(text) from public,anon,authenticated;
grant execute on function public.disconnect_kitchen_computer(text) to authenticated;

-- Preserve the original lease protocol, including agents installed before the settings screen.
alter function public.claim_kitchen_ticket() set schema kitchen_print;
revoke all on function kitchen_print.claim_kitchen_ticket() from public,anon,authenticated;
create function public.claim_kitchen_ticket() returns jsonb language plpgsql security definer set search_path='' as $$
declare job jsonb; d kitchen_print.device;
begin
  perform kitchen_print.verify_device();
  select * into d from kitchen_print.device for share;
  if d.managed and d.destination is null then return null; end if;
  job := kitchen_print.claim_kitchen_ticket();
  if job is null then return null; end if;
  if d.managed then job := job || jsonb_build_object('destination',d.destination); end if;
  return job;
end $$;

create or replace function kitchen_print.capture() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.status in ('delivered','cancelled') then
    update kitchen_print.jobs set state='cancelled',lease=null where order_id=new.id and state in ('pending','reserved');
  elsif old.status='received' and new.status='confirmed' and public.is_admin()
    and exists(select from kitchen_print.device where enabled) then
    insert into kitchen_print.jobs(order_id,ticket) values(new.id,jsonb_build_object('code',new.code,
      'ordered_at',to_char(new.created_at at time zone 'America/Sao_Paulo','DD/MM HH24:MI'),'items',new.items))
      on conflict(order_id,copy_no) do nothing;
  end if;
  return new;
end $$;

revoke all on function kitchen_print.require_admin(text),public.invite_kitchen_computer(text),public.connect_kitchen_computer(text,text),
  public.kitchen_heartbeat(text[]),public.kitchen_printer_settings(text),public.save_kitchen_printer(text,jsonb,boolean),
  public.test_kitchen_printer(text,uuid),public.cancel_kitchen_test(text,uuid),public.claim_kitchen_ticket() from public,anon,authenticated;
grant execute on function public.invite_kitchen_computer(text),public.kitchen_printer_settings(text),public.save_kitchen_printer(text,jsonb,boolean),
  public.test_kitchen_printer(text,uuid),public.cancel_kitchen_test(text,uuid) to authenticated;
grant execute on function public.connect_kitchen_computer(text,text),public.kitchen_heartbeat(text[]),public.claim_kitchen_ticket() to anon;

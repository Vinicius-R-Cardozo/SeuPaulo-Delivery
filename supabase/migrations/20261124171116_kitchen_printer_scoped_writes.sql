-- The PostgREST authenticator uses safeupdate. Target the singleton kitchen explicitly.
create or replace function public.kitchen_heartbeat(p_queues text[]) returns void
language plpgsql security definer set search_path='' as $$
begin
  perform kitchen_print.verify_device();
  update kitchen_print.device set last_seen=now(), queues=array(select distinct left(q,250)
    from unnest(p_queues) q where q<>'' order by 1 limit 256)
    where singleton;
end $$;

create or replace function public.save_kitchen_printer(p_access text,p_destination jsonb,p_enabled boolean) returns void
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
  update kitchen_print.device set destination=dest, enabled=p_enabled where singleton;
end $$;

create or replace function public.disconnect_kitchen_computer(p_access text) returns void language plpgsql
security definer set search_path='' as $$
begin
  perform kitchen_print.require_admin(p_access);
  delete from kitchen_print.invitation where singleton;
  delete from kitchen_print.device where singleton;
  update kitchen_print.jobs set state='cancelled',lease=null where order_id is null and state in ('pending','reserved');
end $$;

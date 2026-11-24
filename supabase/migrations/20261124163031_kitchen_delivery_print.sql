-- One kitchen for this restaurant. Pairing the local agent opts in to new tickets.
create schema kitchen_print;
revoke all on schema kitchen_print from public, anon, authenticated;
create table kitchen_print.device (
  singleton boolean primary key default true check (singleton),
  secret_hash text not null check (secret_hash ~ '^[0-9a-f]{64}$')
);
create table kitchen_print.jobs (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  copy_no integer not null default 0 check (copy_no >= 0),
  ticket jsonb not null,
  state text not null default 'pending' check
    (state in ('pending','reserved','sending','sent','review','cancelled')),
  lease uuid,
  available_at timestamptz not null default now(),
  retrying boolean not null default false,
  unique(order_id, copy_no)
);
create index kitchen_print_ready on kitchen_print.jobs (available_at, id)
  where state in ('pending','reserved');

create function kitchen_print.capture() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.status in ('delivered','cancelled') then
    update kitchen_print.jobs set state='cancelled', lease=null
      where order_id=new.id and state in ('pending','reserved');
  elsif old.status='received' and new.status='confirmed' and public.is_admin()
    and exists (select from kitchen_print.device) then
    insert into kitchen_print.jobs(order_id,ticket) values(new.id,
      jsonb_build_object('code',new.code,'ordered_at',
        to_char(new.created_at at time zone 'America/Sao_Paulo','DD/MM HH24:MI'),
        'items',new.items)) on conflict(order_id,copy_no) do nothing;
  end if;
  return new;
end $$;
create trigger kitchen_delivery_status after update of status on public.orders
  for each row when (new.fulfillment='delivery' and new.status is distinct from old.status)
  execute function kitchen_print.capture();

create function kitchen_print.verify_device() returns void language plpgsql
security definer set search_path='' as $$
declare token text := current_setting('request.headers',true)::jsonb->>'x-kitchen-key';
begin
  if not exists(select from kitchen_print.device where secret_hash =
    encode(sha256(convert_to(token,'UTF8')),'hex')) then
    raise exception 'Agente sem autorização' using errcode='42501';
  end if;
end $$;

create function public.claim_kitchen_ticket() returns jsonb language plpgsql
security definer set search_path='' as $$
declare job kitchen_print.jobs;
begin
  perform kitchen_print.verify_device();
  update kitchen_print.jobs set state='reserved', lease=gen_random_uuid(),
    available_at=now()+interval '45 seconds'
    where id=(select id from kitchen_print.jobs where state in ('pending','reserved')
      and available_at<=now() order by available_at,id limit 1 for update skip locked)
    returning * into job;
  if not found then return null; end if;
  return jsonb_build_object('lease',job.lease,'copy',job.copy_no,'ticket',job.ticket);
end $$;
create unique index kitchen_print_lease on kitchen_print.jobs(lease) where lease is not null;

-- Reserve before opening the printer. Only an acknowledged 'begin' permits writing.
-- A sending lease is never automatically reclaimed, even if the agent crashes.
create function public.update_kitchen_ticket(p_lease uuid,p_action text) returns boolean
language plpgsql security definer set search_path='' as $$
begin
  perform kitchen_print.verify_device();
  if p_action='begin' then
    update kitchen_print.jobs set state='sending',available_at=now()+interval '2 minutes'
      where lease=p_lease and state='reserved' and available_at>now();
  elsif p_action='retry' then
    update kitchen_print.jobs set state='pending',retrying=true,lease=null,available_at=now()+interval '10 seconds'
      where lease=p_lease and state='reserved';
  elsif p_action in ('sent','review') then
    update kitchen_print.jobs set state=p_action,lease=null where lease=p_lease and state='sending';
  else
    raise exception 'Ação inválida';
  end if;
  return found;
end $$;

create function public.kitchen_ticket_status(p_order uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare job kitchen_print.jobs;
begin
  if public.is_admin() is not true then raise insufficient_privilege; end if;
  select * into job from kitchen_print.jobs where order_id=p_order order by copy_no desc limit 1;
  if not found then return null; end if;
  return jsonb_build_object('id',job.id,'copy',job.copy_no,'state',case
    when job.state='sending' and job.available_at<=now() then 'review'
    when job.retrying and job.state in ('pending','reserved') then 'retry'
    else job.state end);
end $$;

create function public.reprint_kitchen_ticket(p_order uuid,p_job uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare job kitchen_print.jobs;
begin
  if public.is_admin() is not true then raise insufficient_privilege; end if;
  perform 1 from public.orders where id=p_order and status not in ('cancelled','delivered') for update;
  if not found then return false; end if;
  select * into job from kitchen_print.jobs where order_id=p_order order by copy_no desc limit 1 for update;
  if not found or job.id<>p_job or p_job is null then return false; end if;
  if job.state='sending' and job.available_at<=now() then
    update kitchen_print.jobs set state='review',lease=null where id=job.id;
  elsif job.state not in ('review','sent') then return false;
  end if;
  insert into kitchen_print.jobs(order_id,ticket,copy_no) values(job.order_id,job.ticket,job.copy_no+1);
  return true;
end $$;

revoke all on all functions in schema kitchen_print from public,anon,authenticated;
revoke all on function public.claim_kitchen_ticket(),public.update_kitchen_ticket(uuid,text),
  public.kitchen_ticket_status(uuid),public.reprint_kitchen_ticket(uuid,uuid) from public,anon,authenticated;
grant execute on function public.claim_kitchen_ticket(),public.update_kitchen_ticket(uuid,text) to anon;
grant execute on function public.kitchen_ticket_status(uuid),public.reprint_kitchen_ticket(uuid,uuid) to authenticated;

create table order_live.email_queue (
  id uuid primary key default gen_random_uuid(),
  event_key text not null unique,
  recipient uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('order_received','order_completed','customer_verified',
    'driver_application_received','driver_approved','driver_rejected','driver_resubmission')),
  content jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  next_attempt timestamptz not null default now(),
  attempts integer not null default 0,
  lease uuid,
  finished_at timestamptz
);
alter table order_live.email_queue enable row level security;
create index email_queue_ready_idx on order_live.email_queue(next_attempt) where finished_at is null;
create index email_queue_lease_idx on order_live.email_queue(lease) where lease is not null;
create index email_queue_created_idx on order_live.email_queue(created_at);
create index email_queue_recipient_idx on order_live.email_queue(recipient);

create function order_live.enqueue_email(p_recipient uuid,p_event text,p_kind text,p_content jsonb default '{}'::jsonb)
returns void language sql set search_path='' as $$
  insert into order_live.email_queue(recipient,event_key,kind,content)
  select p_recipient,p_event,p_kind,p_content
  where exists(select 1 from auth.users u where u.id=p_recipient and u.email_confirmed_at is not null
    and nullif(u.email,'') is not null)
  on conflict(event_key) do nothing
$$;

create function order_live.notify_order_email() returns trigger
language plpgsql security definer set search_path='' as $$
declare kind text; items jsonb;
begin
  if tg_op='INSERT' and new.status='received' then kind:='order_received';
  elsif tg_op='UPDATE' and new.status='delivered' and old.status is distinct from new.status then kind:='order_completed';
  else return null;
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'name',left(coalesce(it.value->'product'->>'name','Item'),180),
    'quantity',it.value->'quantity','unitPrice',it.value->'unitPrice'
  ) order by it.idx),'[]'::jsonb) into items
  from jsonb_array_elements(case jsonb_typeof(new.items) when 'array' then new.items else '[]'::jsonb end)
    with ordinality as it(value,idx);
  perform order_live.enqueue_email(new.customer_id,kind||':'||new.id,kind,jsonb_build_object(
    'code',new.code,'items',items,'fulfillment',new.fulfillment,'subtotal',new.subtotal,
    'deliveryFee',new.delivery_fee,'discount',new.discount,'total',new.total,'paymentMethod',new.payment_method
  ));
  return null;
end $$;
create trigger order_transaction_email after insert or update of status on public.orders
for each row execute function order_live.notify_order_email();

create function order_live.notify_customer_verification() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if tg_table_schema='auth' then
    -- Ordinary stand-alone driver registrations may be auto-confirmed by Auth.
    if exists(select 1 from public.profiles p join public.signup_verifications v on v.user_id=p.id
      where p.id=new.id and p.role='customer' and lower(v.email)=lower(new.email) and v.consumed) then
        perform order_live.enqueue_email(new.id,'customer_verified:'||new.id,'customer_verified');
    end if;
  else
    perform order_live.enqueue_email(new.id,'customer_verified:'||new.id,'customer_verified');
  end if;
  return null;
end $$;
create trigger customer_email_verified after update of email_confirmed_at on auth.users
for each row when (old.email_confirmed_at is null and new.email_confirmed_at is not null)
execute function order_live.notify_customer_verification();
create trigger linked_customer_email_verified after update of customer_enabled on public.profiles
for each row when (old.customer_enabled=false and new.customer_enabled=true and new.role='driver')
execute function order_live.notify_customer_verification();

create function order_live.notify_driver_email() returns trigger
language plpgsql security definer set search_path='' as $$
declare kind text;
begin
  if tg_op='INSERT' then kind:='driver_application_received';
  elsif new.status='approved' and new.admin_confirmed and not(old.status='approved' and old.admin_confirmed) then
    kind:='driver_approved';
  elsif new.status is distinct from old.status or new.reviews is distinct from old.reviews then
    kind:=case new.status when 'rejected' then 'driver_rejected'
      when 'needs_resubmission' then 'driver_resubmission' end;
  end if;
  if kind is not null then
    perform order_live.enqueue_email(new.user_id,kind||':'||new.id||':'||txid_current()::text,kind);
  end if;
  return null;
end $$;
create trigger driver_transaction_email after insert or update of status,admin_confirmed,reviews on public.driver_applications
for each row execute function order_live.notify_driver_email();

create function public.claim_transaction_email() returns table(
  id uuid,lease uuid,email text,kind text,content jsonb
) language plpgsql security definer set search_path='' as $$
begin
  delete from order_live.email_queue q where q.created_at<now()-interval '7 days';
  return query
  with picked as (
    select q.id from order_live.email_queue q join auth.users u on u.id=q.recipient
    where q.finished_at is null and q.next_attempt<=now() and u.email_confirmed_at is not null
      and nullif(u.email,'') is not null
    order by q.next_attempt,q.id limit 15 for update of q skip locked
  ), claimed as (
    update order_live.email_queue q set lease=gen_random_uuid(),next_attempt=now()+interval '90 seconds',attempts=q.attempts+1
    from picked p where q.id=p.id returning q.*
  )
  select q.id,q.lease,u.email::text,q.kind,q.content from claimed q join auth.users u on u.id=q.recipient;
end $$;

create function public.finish_transaction_email(p_lease uuid,p_result text) returns void
language plpgsql security definer set search_path='' as $$
begin
  if p_result in ('sent','invalid') then
    update order_live.email_queue set finished_at=now(), content='{}'::jsonb,lease=null where lease=p_lease;
  else
    update order_live.email_queue set lease=null,
      next_attempt=now()+make_interval(mins=>least(30,attempts*attempts)) where lease=p_lease;
  end if;
end $$;
revoke all on function public.claim_transaction_email(),public.finish_transaction_email(uuid,text) from public,anon,authenticated;
grant execute on function public.claim_transaction_email(),public.finish_transaction_email(uuid,text) to service_role;

create or replace function order_live.dispatch() returns void language plpgsql security definer set search_path='' as $$
declare endpoint text; secret text;
begin
  if not exists(select 1 from order_live.devices where pending and next_attempt<=now())
     and not exists(select 1 from order_live.push_queue where next_attempt<=now() or expires_at<=now())
     and not exists(select 1 from order_live.email_queue where (finished_at is null and next_attempt<=now())
       or created_at<now()-interval '7 days') then return; end if;
  select decrypted_secret into endpoint from vault.decrypted_secrets where name='order_live_worker_url';
  select decrypted_secret into secret from vault.decrypted_secrets where name='order_live_worker_secret';
  if endpoint is not null and secret is not null then
    perform net.http_post(url:=endpoint,headers:=jsonb_build_object('x-order-live-secret',secret),body:='{}'::jsonb);
  end if;
end $$;

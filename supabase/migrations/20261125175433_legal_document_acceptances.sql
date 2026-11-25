create schema legal_internal;
revoke all on schema legal_internal from public, anon, authenticated;

create table legal_internal.acceptances (
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null,
  revision integer not null,
  accepted_at timestamptz not null default now(),
  source text not null check (source in ('customer_signup', 'driver_signup', 'renewal')),
  primary key (user_id, kind, revision),
  foreign key (kind, revision) references public.legal_documents (kind, revision)
);

alter table legal_internal.acceptances enable row level security;
revoke all on legal_internal.acceptances from public, anon, authenticated;

alter table public.signup_verifications
  add column legal_terms_revision integer,
  add column legal_privacy_revision integer,
  add constraint signup_legal_revision_pair check (
    (legal_terms_revision is null and legal_privacy_revision is null)
    or (legal_terms_revision is not null and legal_privacy_revision is not null
        and legal_terms_revision > 0 and legal_privacy_revision > 0)
  );

create function legal_internal.current_documents()
returns table (kind text, revision integer)
language sql stable set search_path = '' as $$
  select distinct on (d.kind) d.kind, d.revision
  from public.legal_documents d
  order by d.kind, d.revision desc;
$$;

create function public.legal_requirements()
returns table (kind text, revision integer, accepted boolean)
language sql stable security definer set search_path = '' as $$
  select d.kind, d.revision, a.user_id is not null
  from legal_internal.current_documents() d
  left join legal_internal.acceptances a
    on (a.kind, a.revision) = (d.kind, d.revision) and a.user_id = (select auth.uid());
$$;

revoke all on function public.legal_requirements() from public, anon, authenticated;
grant execute on function public.legal_requirements() to anon, authenticated;

create function public.validate_signup_legal_acceptance(p_terms_revision integer, p_privacy_revision integer)
returns void language plpgsql stable security definer set search_path = '' as $$
declare
  terms_revision integer;
  privacy_revision integer;
begin
  select max(revision) filter (where kind = 'terms'), max(revision) filter (where kind = 'privacy')
    into terms_revision, privacy_revision from legal_internal.current_documents();

  -- Older clients can still finish onboarding before the first official publication.
  if terms_revision is null and privacy_revision is null
     and p_terms_revision is null and p_privacy_revision is null then
    return;
  end if;

  if terms_revision is null or privacy_revision is null then
    raise exception using errcode = '55000', message = 'Os documentos oficiais para cadastro ainda não estão disponíveis.';
  end if;

  if p_terms_revision is distinct from terms_revision or p_privacy_revision is distinct from privacy_revision then
    raise exception using errcode = '22023', message = 'Leia e confirme as versões vigentes dos documentos para continuar.';
  end if;
end;
$$;

create function public.record_signup_legal_acceptance(
  p_user_id uuid, p_terms_revision integer, p_privacy_revision integer, p_source text
)
returns void language sql security definer set search_path = '' as $$
  insert into legal_internal.acceptances (user_id, kind, revision, source)
  values (p_user_id, 'terms', p_terms_revision, p_source),
         (p_user_id, 'privacy', p_privacy_revision, p_source)
  on conflict (user_id, kind, revision) do nothing;
$$;

revoke all on function public.validate_signup_legal_acceptance(integer, integer),
  public.record_signup_legal_acceptance(uuid, integer, integer, text) from public, anon, authenticated;
grant execute on function public.validate_signup_legal_acceptance(integer, integer),
  public.record_signup_legal_acceptance(uuid, integer, integer, text) to service_role;

create function legal_internal.record_verified_customer_acceptance()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public.record_signup_legal_acceptance(
    new.user_id, new.legal_terms_revision, new.legal_privacy_revision, 'customer_signup'
  );
  return new;
end;
$$;

create trigger record_verified_customer_legal_acceptance
after update of consumed on public.signup_verifications
for each row when (not old.consumed and new.consumed and new.legal_terms_revision is not null)
execute function legal_internal.record_verified_customer_acceptance();

create function public.accept_legal_documents(p_terms_revision integer, p_privacy_revision integer)
returns void language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
begin
  if actor is null then
    raise exception using errcode = '42501', message = 'Entre na sua conta para continuar.';
  end if;

  lock table public.legal_documents in share mode;
  if exists (
    select 1 from (values ('terms', p_terms_revision), ('privacy', p_privacy_revision)) as s(kind, revision)
    left join legal_internal.current_documents() d on d.kind = s.kind
    left join legal_internal.acceptances a
      on (a.kind, a.revision) = (d.kind, d.revision) and a.user_id = actor
    where (s.revision is not null and s.revision is distinct from d.revision)
       or (d.revision is not null and a.user_id is null and d.revision is distinct from s.revision)
  ) then
    raise exception using errcode = '22023', message = 'Os documentos vigentes mudaram. Confira as versões exibidas e tente novamente.';
  end if;

  insert into legal_internal.acceptances (user_id, kind, revision, source)
  select actor, s.kind, s.revision, 'renewal'
  from (values ('terms', p_terms_revision), ('privacy', p_privacy_revision)) as s(kind, revision)
  where s.revision is not null
  on conflict (user_id, kind, revision) do nothing;
end;
$$;

revoke all on function public.accept_legal_documents(integer, integer) from public, anon, authenticated;
grant execute on function public.accept_legal_documents(integer, integer) to authenticated;

create function legal_internal.require_current_acceptances(p_user_id uuid)
returns void language plpgsql stable set search_path = '' as $$
begin
  if exists (
    select 1 from legal_internal.current_documents() d
    where not exists (
      select 1 from legal_internal.acceptances a
      where a.user_id = p_user_id and (a.kind, a.revision) = (d.kind, d.revision)
    )
  ) then
    raise exception using errcode = '42501', message = 'Confira e confirme os documentos vigentes do Seu Paulo Delivery para continuar.';
  end if;
end;
$$;

create function legal_internal.guard_order_acceptances()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    perform legal_internal.require_current_acceptances(new.customer_id);
  elsif new.driver_id is not null and new.driver_id is distinct from old.driver_id then
    perform legal_internal.require_current_acceptances(new.driver_id);
  end if;
  return new;
end;
$$;

create trigger guard_new_order_legal_acceptances before insert or update of driver_id on public.orders
for each row execute function legal_internal.guard_order_acceptances();

create function legal_internal.guard_driver_application_acceptances()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform legal_internal.require_current_acceptances(new.user_id);
  return new;
end;
$$;

create trigger guard_driver_application_legal_acceptances before insert on public.driver_applications
for each row execute function legal_internal.guard_driver_application_acceptances();

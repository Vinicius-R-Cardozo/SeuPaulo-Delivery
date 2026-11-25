create table public.legal_documents (
  kind text not null check (kind in ('terms', 'privacy')),
  revision integer not null check (revision > 0),
  body text not null check (char_length(body) <= 60000 and body ~ '[^[:space:]]'),
  published_at timestamptz not null default now(),
  primary key (kind, revision)
);

alter table public.legal_documents enable row level security;

revoke all on public.legal_documents from public, anon, authenticated;
grant select on public.legal_documents to anon, authenticated;
grant insert (kind, revision, body) on public.legal_documents to authenticated;

create policy "Anyone reads published legal documents"
  on public.legal_documents for select to anon, authenticated using (true);

create policy "Admins publish legal documents"
  on public.legal_documents for insert to authenticated
  with check ((select public.is_admin()));

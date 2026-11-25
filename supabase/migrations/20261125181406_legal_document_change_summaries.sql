alter table public.legal_documents
  add column change_summary text,
  add constraint legal_document_change_summary_required check (
    (revision = 1 and change_summary is null)
    or (change_summary is not null and char_length(change_summary) <= 2000
        and change_summary ~ '[^[:space:]]')
  ) not valid;

grant insert (change_summary) on public.legal_documents to authenticated;

drop function public.legal_requirements();

create function public.legal_requirements()
returns table (kind text, revision integer, accepted boolean, changes jsonb)
language sql stable security definer set search_path = '' as $$
  select d.kind, d.revision, coalesce(a.revision = d.revision, false),
    coalesce((
      select jsonb_agg(jsonb_build_object('revision', p.revision, 'summary', p.change_summary)
        order by p.revision)
      from public.legal_documents p
      where (select auth.uid()) is not null and p.kind = d.kind
        and p.revision > coalesce(a.revision, d.revision - 1)
        and p.change_summary is not null
    ), '[]'::jsonb)
  from legal_internal.current_documents() d
  left join lateral (
    select l.revision
    from legal_internal.acceptances l
    where l.user_id = (select auth.uid()) and l.kind = d.kind
    order by l.revision desc
    limit 1
  ) a on true;
$$;

revoke all on function public.legal_requirements() from public, anon, authenticated;
grant execute on function public.legal_requirements() to anon, authenticated;

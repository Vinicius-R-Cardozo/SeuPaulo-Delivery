-- Uploads submitted for review are immutable. The owner can upload new versions.
alter policy "driver-docs: dono atualiza" on storage.objects using (
  bucket_id='driver-docs' and (storage.foldername(name))[1]=(select auth.uid())::text
  and (storage.foldername(name))[2] is distinct from 'reenvios'
  and not exists (
    select 1 from public.driver_applications a, lateral jsonb_array_elements(case jsonb_typeof(a.documents) when 'array' then a.documents else '[]'::jsonb end) doc
    where a.user_id=(select auth.uid()) and doc->>'path'=objects.name
  )
) with check (
  bucket_id='driver-docs' and (storage.foldername(name))[1]=(select auth.uid())::text
  and (storage.foldername(name))[2] is distinct from 'reenvios'
  and not exists (
    select 1 from public.driver_applications a, lateral jsonb_array_elements(case jsonb_typeof(a.documents) when 'array' then a.documents else '[]'::jsonb end) doc
    where a.user_id=(select auth.uid()) and doc->>'path'=objects.name
  )
);

create function public.resubmit_driver_documents(
  p_application uuid, p_expected_updated_at timestamptz, p_upload uuid, p_kinds text[]
) returns public.driver_applications
language plpgsql security definer set search_path='' as $$
declare
  actor uuid:=auth.uid();
  application public.driver_applications;
  kind text;
  path text;
  allowed text[];
  replaced jsonb:='[]'::jsonb;
  preserved jsonb;
begin
  if actor is null then raise exception 'Entre para reenviar seus documentos.'; end if;
  select * into application from public.driver_applications
    where id=p_application and user_id=actor for update;
  if not found then raise exception 'Cadastro indisponível.'; end if;
  if application.status<>'needs_resubmission' or application.updated_at is distinct from p_expected_updated_at then
    raise exception 'A situação do cadastro mudou. Consulte o painel antes de reenviar.';
  end if;
  allowed:=case application.vehicle when 'moto' then array['selfie','cnh_front','cnh_back','vehicle_doc']
    else array['selfie','bike_photo'] end;
  if p_upload is null or coalesce(cardinality(p_kinds),0)=0 or cardinality(p_kinds)>cardinality(allowed)
      or not (p_kinds<@allowed)
      or cardinality(p_kinds)<>(select count(distinct value) from unnest(p_kinds) as kinds(value)) then
    raise exception 'Selecione os documentos que deseja reenviar.';
  end if;

  foreach kind in array p_kinds loop
    path:=actor||'/reenvios/'||p_upload||'/'||kind||'.jpg';
    if not exists(select 1 from storage.objects o where o.bucket_id='driver-docs' and o.name=path
      and o.owner_id=actor::text and o.metadata->>'mimetype'='image/jpeg') then
      raise exception 'Não encontramos um dos arquivos enviados. Envie as imagens novamente.';
    end if;
    replaced:=replaced||jsonb_build_object('kind',kind,'path',path,'uploadedAt',now(),'ocr',null);
  end loop;
  select coalesce(jsonb_agg(doc.value order by doc.idx),'[]'::jsonb) into preserved
    from jsonb_array_elements(case jsonb_typeof(application.documents) when 'array' then application.documents else '[]'::jsonb end) with ordinality doc(value,idx)
    where not coalesce(doc.value->>'kind'=any(p_kinds),false);

  update public.driver_applications set
    documents=preserved||replaced,status='manual_review',admin_confirmed=false,auto_analysis=null,
    reviews=reviews||jsonb_build_object('at',now(),'by',actor,'action','resubmitted',
      'status','manual_review','documents',to_jsonb(p_kinds)),updated_at=clock_timestamp()
  where id=p_application returning * into application;
  insert into public.notifications(user_id,audience,title,body)
    select p.id,'admin','Documentos reenviados','Abra as solicitações para revisar os novos arquivos.'
    from public.profiles p where p.role='admin';
  return application;
end $$;
revoke all on function public.resubmit_driver_documents(uuid,timestamptz,uuid,text[]) from public,anon,authenticated;
grant execute on function public.resubmit_driver_documents(uuid,timestamptz,uuid,text[]) to authenticated;

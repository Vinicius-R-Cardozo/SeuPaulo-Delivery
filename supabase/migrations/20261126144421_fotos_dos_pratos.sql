insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'product-images',
  'product-images',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
);

create policy "product-images: admins enviam fotos"
  on storage.objects
  for insert
  to authenticated
  with check (bucket_id = 'product-images' and (select public.is_admin()));

update public.products as product
   set image = 'https://www.seupaulobuteco.com.br/delivery-menu/' || photo.filename
  from (values
    ('menu-virado-a-paulista', 'virado-a-paulista.webp'),
    ('menu-picanha-com-fritas', 'picanha-com-fritas.webp'),
    ('menu-fraldinha-molho-madeira', 'fraldinha-molho-madeira.webp'),
    ('menu-feijoada-da-casa', 'feijoada-da-casa.webp'),
    ('menu-espaguete-bolonhesa', 'espaguete-bolonhesa.webp'),
    ('menu-tilapia-empanada', 'tilapia-empanada.webp'),
    ('menu-bife-de-boi', 'bife-de-boi.webp'),
    ('menu-almondegas-ao-molho', 'almondegas-ao-molho.webp'),
    ('menu-file-de-frango-grelhado', 'file-de-frango-grelhado.webp'),
    ('menu-grao-de-bico-ou-soja', 'grao-de-bico.webp'),
    ('menu-fritas', 'fritas.webp')
  ) as photo(id, filename)
 where product.id = photo.id
   and product.archived_at is null
   and coalesce(product.image, '') in ('', '/mark.png');

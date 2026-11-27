-- Mantém o cardápio restrito a almoço, fritas e às bebidas selecionadas.
alter table public.products
  drop constraint products_delivery_lunch_and_fries_check,
  add constraint products_delivery_catalog_check check (
    category_slug = 'pratos'
    or (id = 'menu-fritas' and category_slug = 'porcoes')
    or (
      category_slug = 'bebidas' and id in (
        'menu-refrigerante',
        'menu-itubaina',
        'menu-agua-sem-gas',
        'menu-agua-com-gas',
        'menu-mamba-water-com-gas'
      )
    )
    or (archived_at is not null and not available)
  );

-- Reativa os cadastros oficiais existentes, preservando preço, opções e histórico.
update public.products
   set available = true, archived_at = null
 where category_slug = 'bebidas'
   and id in (
     'menu-refrigerante',
     'menu-itubaina',
     'menu-agua-sem-gas',
     'menu-agua-com-gas',
     'menu-mamba-water-com-gas'
   )
   and (archived_at is not null or not available);

-- O Delivery vende os pratos de almoço e mantém Fritas como acompanhamento.
update public.products
   set available = false, archived_at = coalesce(archived_at, statement_timestamp())
 where category_slug <> 'pratos'
   and not (id = 'menu-fritas' and category_slug = 'porcoes')
   and (available or archived_at is null);

alter table public.products
  add constraint products_delivery_lunch_and_fries_check check (
    category_slug = 'pratos'
    or (id = 'menu-fritas' and category_slug = 'porcoes')
    or (archived_at is not null and not available)
  );

update public.categories
   set name = 'Acompanhamento', sort_order = 4
 where slug = 'porcoes';

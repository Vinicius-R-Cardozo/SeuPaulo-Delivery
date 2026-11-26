-- Fritas acompanha o almoço nos dias de funcionamento do Delivery.
update public.products
   set available_weekdays = array[0,2,3,4,5,6]::smallint[]
 where id = 'menu-fritas' and category_slug = 'porcoes'
   and archived_at is null and available_weekdays is null;

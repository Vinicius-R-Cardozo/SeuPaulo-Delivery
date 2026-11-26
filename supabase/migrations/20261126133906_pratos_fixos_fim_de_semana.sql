-- As opções fixas são servidas de terça a domingo, nos dias de funcionamento.
update public.products
   set available_weekdays = array[0,2,3,4,5,6]::smallint[]
 where category_slug = 'pratos'
   and archived_at is null
   and id in (
     'menu-bife-de-boi',
     'menu-almondegas-ao-molho',
     'menu-file-de-frango-grelhado',
     'menu-grao-de-bico-ou-soja'
   );

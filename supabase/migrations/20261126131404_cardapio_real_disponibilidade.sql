-- Disponibilidade semanal no fuso do bar. NULL significa sem restrição de dia.
alter table public.products
  add column available_weekdays smallint[],
  add column archived_at timestamptz,
  add constraint products_available_weekdays_check check (
    available_weekdays is null or (
      array_ndims(available_weekdays) = 1
      and cardinality(available_weekdays) between 1 and 7
      and available_weekdays <@ array[0,1,2,3,4,5,6]::smallint[]
    )
  );

create schema menu_internal;
revoke all on schema menu_internal from public;
grant usage on schema menu_internal to anon, authenticated, service_role;

create function menu_internal.served_on(p_weekdays smallint[], p_at timestamptz)
returns boolean
language sql
stable
set search_path = ''
as $$
  select p_weekdays is null
    or extract(dow from p_at at time zone 'America/Sao_Paulo')::smallint = any(p_weekdays);
$$;

revoke all on function menu_internal.served_on(smallint[], timestamptz) from public;
grant execute on function menu_internal.served_on(smallint[], timestamptz) to anon, authenticated, service_role;

alter policy "products: leitura pública" on public.products using (
  available and menu_internal.served_on(available_weekdays, statement_timestamp())
);

-- As permissões de edição do painel continuam valendo para o catálogo em uso.
create policy "products: catálogo sem arquivados"
  on public.products as restrictive for select using (archived_at is null);

-- O RPC hospedado e o checkout legado gravam o mesmo snapshot de produto.
-- Validar na inserção preserva o cálculo de valores e as regras do checkout atual.
create function menu_internal.guard_order_products()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  unavailable_name text;
begin
  if jsonb_typeof(new.items) is distinct from 'array' then
    raise exception 'Revise os itens do carrinho.';
  end if;

  select coalesce(p.name, nullif(item #>> '{product,name}', ''), 'Um item do carrinho')
    into unavailable_name
    from jsonb_array_elements(new.items) as cart(item)
    left join public.products as p on p.id = item #>> '{product,id}'
   where p.id is null or not p.available or p.archived_at is not null
     or not menu_internal.served_on(p.available_weekdays, statement_timestamp())
   limit 1;

  if found then
    raise exception '% está indisponível. Remova o item do carrinho para continuar.', unavailable_name;
  end if;

  return new;
end;
$$;

revoke all on function menu_internal.guard_order_products() from public, anon, authenticated;

create trigger guard_order_products
  before insert on public.orders
  for each row execute function menu_internal.guard_order_products();

-- Arquiva somente os IDs de demonstração conhecidos, mantendo os snapshots dos
-- pedidos e os produtos cadastrados pela equipe.
update public.products
   set available = false, archived_at = statement_timestamp()
 where id in (
   'p-agua', 'p-baconburguer', 'p-batata', 'p-batida', 'p-bolinho', 'p-brahma',
   'p-caipirinha', 'p-calabresa', 'p-costela', 'p-dadinho', 'p-feijoada',
   'p-frango', 'p-frangoburguer', 'p-gin', 'p-heineken', 'p-mandioca',
   'p-original', 'p-parmegiana', 'p-picanha', 'p-refri', 'p-sucos',
   'p-torresmo', 'p-xburguer'
 ) or (id = 'p_19bbaa8c-31b0-43f9-bc8b-fb2bf3e8d31a' and description = 'aaaaaa');

-- Catálogo gerado por npm run gen:seed a partir de src/data/menu.ts.
insert into public.categories (id, slug, name, emoji, sort_order) values
  ('c1', 'petiscos', 'Petiscos', '🍟', 1),
  ('c2', 'porcoes', 'Porções', '🍽️', 2),
  ('c3', 'pratos', 'Almoço', '🥩', 3),
  ('c8', 'sobremesas', 'Sobremesas', '🥥', 4),
  ('c5', 'drinks', 'Drinks & Caipirinhas', '🍹', 5),
  ('c6', 'cervejas', 'Cervejas', '🍺', 6),
  ('c7', 'bebidas', 'Bebidas', '🥤', 7)
on conflict (slug) do update set name = excluded.name;

insert into public.products (id, category_slug, name, description, price, image, available, addon_groups, available_weekdays) values
  ('menu-virado-a-paulista', 'pratos', 'Virado à Paulista', 'Bisteca suína, linguiça, tutu de feijão, arroz branco, banana frita, couve refogada e ovo frito. Acompanha a salada do dia.', 38.90, '/mark.png', true, '[]'::jsonb, array[2]::smallint[]),
  ('menu-picanha-com-fritas', 'pratos', 'Picanha com Fritas', 'Com arroz de alho, feijão vermelho, farofa da casa, fritas e ovo frito. Acompanha a salada do dia.', 38.90, '/mark.png', true, '[]'::jsonb, array[3]::smallint[]),
  ('menu-fraldinha-molho-madeira', 'pratos', 'Fraldinha ao Molho Madeira', 'Com arroz, feijão carioca, farofa da casa, purê de batata e ovo frito. Acompanha a salada do dia.', 38.90, '/mark.png', true, '[]'::jsonb, array[4]::smallint[]),
  ('menu-feijoada-da-casa', 'pratos', 'Feijoada da Casa', 'Com arroz, farofa da casa, couve na manteiga, laranja, torresmo e ovo frito. Acompanha a salada do dia.', 38.90, '/mark.png', true, '[]'::jsonb, array[5]::smallint[]),
  ('menu-espaguete-bolonhesa', 'pratos', 'Espaguete à Bolonhesa', 'Com fraldinha e salada do dia.', 32.90, '/mark.png', true, '[]'::jsonb, array[4]::smallint[]),
  ('menu-tilapia-empanada', 'pratos', 'Tilápia Empanada', 'Acompanha feijão carioca, arroz branco, farofa da casa, ovo frito e salada do dia.', 32.90, '/mark.png', true, '[]'::jsonb, array[5]::smallint[]),
  ('menu-bife-de-boi', 'pratos', 'Bife de Boi', 'A cavalo ou acebolado. Acompanha feijão carioca, arroz branco, farofa da casa, ovo frito e salada do dia.', 34.90, '/mark.png', true, '[{"id":"preparo","name":"Preparo","type":"single","required":true,"min":1,"max":1,"options":[{"id":"a-cavalo","name":"A cavalo","price":0},{"id":"acebolado","name":"Acebolado","price":0}]}]'::jsonb, array[2,3,4,5]::smallint[]),
  ('menu-almondegas-ao-molho', 'pratos', 'Almôndegas ao Molho', 'Acompanha feijão carioca, arroz branco, farofa da casa, ovo frito e salada do dia.', 34.90, '/mark.png', true, '[]'::jsonb, array[2,3,4,5]::smallint[]),
  ('menu-file-de-frango-grelhado', 'pratos', 'Filé de Frango Grelhado', 'Acompanha feijão carioca, arroz branco, farofa da casa, ovo frito e salada do dia.', 31.90, '/mark.png', true, '[]'::jsonb, array[2,3,4,5]::smallint[]),
  ('menu-grao-de-bico-ou-soja', 'pratos', 'Grão-de-bico ou Soja', 'Acompanha feijão carioca, arroz branco, farofa da casa, ovo frito e salada do dia.', 32.90, '/mark.png', true, '[{"id":"opcao","name":"Escolha uma opção","type":"single","required":true,"min":1,"max":1,"options":[{"id":"grao-de-bico","name":"Grão-de-bico","price":0},{"id":"soja","name":"Soja","price":0}]}]'::jsonb, array[2,3,4,5]::smallint[]),
  ('menu-pastel-seu-paulo', 'petiscos', 'Pastel Seu Paulo (unidade)', 'Acompanha vinagrete.', 14.00, '/mark.png', true, '[{"id":"recheio","name":"Recheio","type":"single","required":true,"min":1,"max":1,"options":[{"id":"carne-ovo","name":"Carne com ovo","price":0},{"id":"canastra","name":"Queijo Canastra","price":0},{"id":"frango-quiabo","name":"Frango com quiabo","price":0}]}]'::jsonb, null),
  ('menu-bolinho-costela', 'petiscos', 'Bolinho de Costela (8 unidades)', 'Costela desfiada e tempero da casa.', 37.90, '/mark.png', true, '[]'::jsonb, null),
  ('menu-bolinho-carne-paulista', 'petiscos', 'Bolinho de Carne Paulista (8 unidades)', 'Bolinho frito com tempero paulista.', 32.90, '/mark.png', true, '[]'::jsonb, null),
  ('menu-coxinhas-seu-paulo', 'petiscos', 'Coxinhas Seu Paulo (8 unidades)', 'Coxinhas de frango com molho da casa.', 31.90, '/mark.png', true, '[]'::jsonb, null),
  ('menu-jilo-empanado', 'petiscos', 'Jiló Empanado', 'Empanado no queijo parmesão.', 25.00, '/mark.png', true, '[]'::jsonb, null),
  ('menu-pipoquinha-quiabo', 'petiscos', 'Pipoquinha de Quiabo', 'Quiabo em pedaços pequenos, empanado e frito.', 25.00, '/mark.png', true, '[]'::jsonb, null),
  ('menu-combinado-seu-paulo', 'petiscos', 'Combinado Seu Paulo', '1 pastel Seu Paulo, 3 bolinhos de carne paulista, 3 coxinhas e 3 bolinhos de costela.', 49.90, '/mark.png', true, '[]'::jsonb, null),
  ('menu-sacanagem', 'petiscos', 'Sacanagem', 'Espetinho de pimentão e cenoura envolto em mortadela defumada em conserva.', 21.00, '/mark.png', true, '[]'::jsonb, null),
  ('menu-mix-conservas', 'petiscos', 'Mix de Conservas Seu Paulo', 'Muçarela em cubos com acepipes e temperos da casa.', 29.00, '/mark.png', true, '[]'::jsonb, null),
  ('menu-file-aperitivo-seu-paulo', 'porcoes', 'Filé Aperitivo Seu Paulo', 'Contrafilé com rúcula, tomate seco e queijo.', 59.00, '/mark.png', true, '[]'::jsonb, null),
  ('menu-file-aperitivo-da-roca', 'porcoes', 'Filé Aperitivo da Roça', 'Contrafilé com fritas, pimenta biquinho e molho da casa.', 69.00, '/mark.png', true, '[]'::jsonb, null),
  ('menu-frango-passarinho-paulista', 'porcoes', 'Frango à Passarinho Paulista', 'Frango frito com alho.', 32.00, '/mark.png', true, '[]'::jsonb, null),
  ('menu-isca-frango', 'porcoes', 'Isca de Frango', 'Frango crocante com molho da casa.', 35.00, '/mark.png', true, '[]'::jsonb, null),
  ('menu-torresmo-seu-paulo', 'porcoes', 'Torresmo Seu Paulo', 'Barriga de porco curada e frita.', 36.90, '/mark.png', true, '[]'::jsonb, null),
  ('menu-jilo-bacon', 'porcoes', 'Jiló Recheado com Bacon', 'Jiló empanado com recheio de bacon e molho da casa.', 35.00, '/mark.png', true, '[]'::jsonb, null),
  ('menu-moela', 'porcoes', 'Moela', 'Moela cozida com cheiro-verde, picles de cebola e pão de sal.', 32.90, '/mark.png', true, '[]'::jsonb, null),
  ('menu-coracaozinho', 'porcoes', 'Coraçãozinho', 'Coração de frango na chapa com alho, cheiro-verde e picles de cebola.', 39.90, '/mark.png', true, '[]'::jsonb, null),
  ('menu-carne-de-panela', 'porcoes', 'Carne de Panela', 'Carne cozida na cerveja preta com temperos da casa. Acompanha pão de sal.', 39.90, '/mark.png', true, '[]'::jsonb, null),
  ('menu-vaca-atolada', 'porcoes', 'Vaca Atolada', 'Costela cozida com mandioca e pão de sal.', 38.00, '/mark.png', true, '[]'::jsonb, null),
  ('menu-pescoco-de-peru', 'porcoes', 'Pescoço de Peru', 'Pescoço de peru cozido e dourado com pão de sal.', 38.00, '/mark.png', true, '[]'::jsonb, null),
  ('menu-fritas', 'porcoes', 'Fritas', 'Batata frita crocante.', 25.00, '/mark.png', true, '[]'::jsonb, null),
  ('menu-mandioca-aperitivo', 'porcoes', 'Mandioca Aperitivo', 'Mandioca cozida na manteiga.', 27.00, '/mark.png', true, '[]'::jsonb, null),
  ('menu-cocada-caseira', 'sobremesas', 'Cocada Caseira', '', 15.00, '/mark.png', true, '[]'::jsonb, null),
  ('menu-amstel-600', 'cervejas', 'Amstel 600 ml', '', 15.00, '/mark.png', true, '[]'::jsonb, null),
  ('menu-heineken-600', 'cervejas', 'Heineken 600 ml', '', 18.00, '/mark.png', true, '[]'::jsonb, null),
  ('menu-baden-baden-600', 'cervejas', 'Baden Baden 600 ml', '', 24.00, '/mark.png', true, '[]'::jsonb, null),
  ('menu-original-600', 'cervejas', 'Original 600 ml', '', 16.00, '/mark.png', true, '[]'::jsonb, null),
  ('menu-spaten-600', 'cervejas', 'Spaten 600 ml', '', 16.00, '/mark.png', true, '[]'::jsonb, null),
  ('menu-stella-pure-gold-600', 'cervejas', 'Stella Pure Gold 600 ml', '', 18.00, '/mark.png', true, '[]'::jsonb, null),
  ('menu-chope-amstel', 'cervejas', 'Chope Amstel', '', 12.00, '/mark.png', true, '[]'::jsonb, null),
  ('menu-chope-heineken', 'cervejas', 'Chope Heineken', '', 14.00, '/mark.png', true, '[]'::jsonb, null),
  ('menu-chope-brahma', 'cervejas', 'Chope Brahma', '', 12.00, '/mark.png', true, '[]'::jsonb, null),
  ('menu-amstel-ultra-long-neck', 'cervejas', 'Amstel Ultra Long Neck', 'Sem glúten.', 14.00, '/mark.png', true, '[]'::jsonb, null),
  ('menu-heineken-long-neck', 'cervejas', 'Heineken Long Neck', '', 14.00, '/mark.png', true, '[]'::jsonb, null),
  ('menu-heineken-zero-long-neck', 'cervejas', 'Heineken Zero Long Neck', '', 14.00, '/mark.png', true, '[]'::jsonb, null),
  ('menu-praya-long-neck', 'cervejas', 'Praya Long Neck', '', 14.00, '/mark.png', true, '[]'::jsonb, null),
  ('menu-stella-pure-gold-long-neck', 'cervejas', 'Stella Pure Gold Long Neck', '', 14.00, '/mark.png', true, '[]'::jsonb, null),
  ('menu-corona-long-neck', 'cervejas', 'Corona Long Neck', '', 14.00, '/mark.png', true, '[]'::jsonb, null),
  ('menu-corona-zero-long-neck', 'cervejas', 'Corona Zero Long Neck', '', 14.00, '/mark.png', true, '[]'::jsonb, null),
  ('menu-amstel-vibes-morango', 'bebidas', 'Amstel Vibes Morango', '', 12.00, '/mark.png', true, '[]'::jsonb, null),
  ('menu-amstel-vibes-limao', 'bebidas', 'Amstel Vibes Limão', '', 12.00, '/mark.png', true, '[]'::jsonb, null),
  ('menu-xeque-mate', 'bebidas', 'Xeque Mate', 'Com gelo e limão.', 17.00, '/mark.png', true, '[]'::jsonb, null),
  ('menu-refrigerante', 'bebidas', 'Refrigerante KS/Lata', '', 6.00, '/mark.png', true, '[{"id":"sabor","name":"Refrigerante","type":"single","required":true,"min":1,"max":1,"options":[{"id":"guarana","name":"Guaraná","price":0},{"id":"coca-cola","name":"Coca-Cola","price":0},{"id":"coca-zero","name":"Coca-Cola Zero","price":0},{"id":"pepsi-black","name":"Pepsi Black","price":0}]}]'::jsonb, null),
  ('menu-itubaina', 'bebidas', 'Itubaína', '', 8.00, '/mark.png', true, '[]'::jsonb, null),
  ('menu-suco-del-valle', 'bebidas', 'Suco Del Valle', '', 6.00, '/mark.png', true, '[]'::jsonb, null),
  ('menu-red-bull', 'bebidas', 'Red Bull', '', 18.00, '/mark.png', true, '[]'::jsonb, null),
  ('menu-mamba-water-sem-gas', 'bebidas', 'Mamba Water sem Gás', '', 6.00, '/mark.png', true, '[]'::jsonb, null),
  ('menu-mamba-water-com-gas', 'bebidas', 'Mamba Water com Gás', '', 6.00, '/mark.png', true, '[]'::jsonb, null),
  ('menu-fys-tonica', 'bebidas', 'FYS Tônica', '', 6.00, '/mark.png', true, '[]'::jsonb, null),
  ('menu-agua-tonica', 'bebidas', 'Água Tônica', '', 7.00, '/mark.png', true, '[]'::jsonb, null),
  ('menu-agua-sem-gas', 'bebidas', 'Água sem Gás', '', 4.00, '/mark.png', true, '[]'::jsonb, null),
  ('menu-agua-com-gas', 'bebidas', 'Água com Gás', '', 5.00, '/mark.png', true, '[]'::jsonb, null),
  ('menu-cafe-expresso', 'bebidas', 'Café Expresso', '', 7.00, '/mark.png', true, '[]'::jsonb, null),
  ('menu-vaquinha', 'drinks', 'Vaquinha', '', 22.00, '/mark.png', true, '[]'::jsonb, null),
  ('menu-licor-43', 'drinks', 'Licor 43', '', 29.00, '/mark.png', true, '[]'::jsonb, null),
  ('menu-licor-43-vaquinha', 'drinks', 'Licor 43 Vaquinha', '', 35.00, '/mark.png', true, '[]'::jsonb, null),
  ('menu-campari', 'drinks', 'Campari', '', 19.00, '/mark.png', true, '[]'::jsonb, null),
  ('menu-whisky', 'drinks', 'Whisky', '', 25.00, '/mark.png', true, '[]'::jsonb, null),
  ('menu-tequila-jose-cuervo-gold', 'drinks', 'Tequila José Cuervo Gold', '', 25.00, '/mark.png', true, '[]'::jsonb, null),
  ('menu-gin', 'drinks', 'Gin', '', 25.00, '/mark.png', true, '[]'::jsonb, null),
  ('menu-gabriela', 'drinks', 'Gabriela', '', 11.00, '/mark.png', true, '[]'::jsonb, null),
  ('menu-cachaca', 'drinks', 'Cachaça', '', 9.00, '/mark.png', true, '[{"id":"marca","name":"Cachaça","type":"single","required":true,"min":1,"max":1,"options":[{"id":"seleta","name":"Seleta","price":0},{"id":"salinas","name":"Salinas","price":0},{"id":"da-roca","name":"Da Roça","price":0}]}]'::jsonb, null),
  ('menu-moscow-mule', 'drinks', 'Moscow Mule', 'Vodka, Monin de gengibre, limão, água com gás e espuma de gengibre.', 25.00, '/mark.png', true, '[]'::jsonb, null),
  ('menu-fitz-geraldim', 'drinks', 'Fitz Geraldim', 'Gin, limão, açúcar e angostura.', 29.00, '/mark.png', true, '[]'::jsonb, null),
  ('menu-negroni', 'drinks', 'Negroni', 'Gin, vermute rosso, Campari e casca de laranja.', 32.00, '/mark.png', true, '[]'::jsonb, null),
  ('menu-gin-tonica', 'drinks', 'Gin Tônica', 'Gin, limão e água tônica.', 32.00, '/mark.png', true, '[]'::jsonb, null),
  ('menu-gin-tropical', 'drinks', 'Gin Tropical', 'Gin, laranja e energético tropical.', 32.00, '/mark.png', true, '[]'::jsonb, null),
  ('menu-aperol-spritz', 'drinks', 'Aperol Spritz', 'Prosecco, Aperol, água com gás e laranja.', 35.00, '/mark.png', true, '[]'::jsonb, null),
  ('menu-cozumel', 'drinks', 'Cozumel', 'Borda de sal, tequila, limão e Corona.', 32.00, '/mark.png', true, '[]'::jsonb, null),
  ('menu-maracujack', 'drinks', 'Maracujack', 'Jack Daniel’s, maracujá, xarope simples e hortelã.', 32.00, '/mark.png', true, '[]'::jsonb, null),
  ('menu-seu-43', 'drinks', 'Seu 43', 'Licor 43, limão, Sprite e espuma de gengibre.', 45.00, '/mark.png', true, '[]'::jsonb, null),
  ('menu-carajillo', 'drinks', 'Carajillo', 'Licor 43 e café expresso.', 35.00, '/mark.png', true, '[]'::jsonb, null),
  ('menu-rosa-caiana', 'drinks', 'Rosa Caiana', 'Gabriela, xarope de gengibre e limão.', 32.00, '/mark.png', true, '[]'::jsonb, null),
  ('menu-morangin', 'drinks', 'Morangin', 'Morango, gin e soda limonada.', 35.00, '/mark.png', true, '[]'::jsonb, null),
  ('menu-campari-black', 'drinks', 'Campari Black', 'Campari e Pepsi Black.', 32.00, '/mark.png', true, '[]'::jsonb, null),
  ('menu-tinto-do-verano', 'drinks', 'Tinto do Verano', 'Vinho tinto suave e soda italiana.', 32.00, '/mark.png', true, '[]'::jsonb, null),
  ('menu-sunset-spritz', 'drinks', 'Sunset Spritz', 'Corona e Aperol Spritz.', 32.00, '/mark.png', true, '[]'::jsonb, null),
  ('menu-morito-morango', 'drinks', 'Morito Morango', 'Rum, morango, hortelã e água com gás.', 35.00, '/mark.png', true, '[]'::jsonb, null),
  ('menu-london-mule', 'drinks', 'London Mule', 'Gin, limão, xarope de gengibre, angostura e soda italiana.', 32.00, '/mark.png', true, '[]'::jsonb, null),
  ('menu-caipirinha-seu-paulo', 'drinks', 'Caipirinha Seu Paulo', '', 23.00, '/mark.png', true, '[{"id":"sabor","name":"Escolha a caipirinha","type":"single","required":true,"min":1,"max":1,"options":[{"id":"nunca-erra","name":"Nunca Erra · limão","price":0},{"id":"maranguita","name":"Maranguita · morango","price":0},{"id":"calmaria-acida","name":"Calmaria Ácida · maracujá","price":0},{"id":"samba-no-calice","name":"Samba no Cálice · vinho","price":0},{"id":"brisa-citrica","name":"Brisa Cítrica · laranja","price":0},{"id":"caip-kiwi","name":"Caip Kiwi · kiwi","price":0},{"id":"sertao-refrescante","name":"Sertão Refrescante · caju","price":0},{"id":"pina-louca","name":"Pina Louca · abacaxi","price":0},{"id":"duas-caras","name":"Duas Caras · limão e maracujá","price":0},{"id":"choppirinha","name":"Choppirinha · cerveja","price":0},{"id":"dama-de-vermelho","name":"Dama de Vermelho · groselha","price":0},{"id":"dankey-kong","name":"Dankey Kong · banana","price":0},{"id":"hortelzinha","name":"Hortelzinha · hortelã","price":0},{"id":"caipibrown","name":"Caipibrown · morena","price":0},{"id":"suica-gelada","name":"Suíça Gelada · suíça","price":0},{"id":"camparinha","name":"Camparinha · Campari","price":0},{"id":"caipigabi","name":"Caipigabi · Gabriela","price":0},{"id":"caiperol","name":"Caiperol · Aperol","price":0},{"id":"caipipacoca","name":"Caipipaçoca · paçoca e leite condensado","price":0},{"id":"kiuvinha","name":"Kiuvinha · kiwi e uvas verdes","price":0}]}]'::jsonb, null),
  ('menu-caip-vodka-seu-paulo', 'drinks', 'Caip Vodka Seu Paulo', '', 26.00, '/mark.png', true, '[{"id":"sabor","name":"Escolha a caipirinha","type":"single","required":true,"min":1,"max":1,"options":[{"id":"nunca-erra","name":"Nunca Erra · limão","price":0},{"id":"maranguita","name":"Maranguita · morango","price":0},{"id":"calmaria-acida","name":"Calmaria Ácida · maracujá","price":0},{"id":"samba-no-calice","name":"Samba no Cálice · vinho","price":0},{"id":"brisa-citrica","name":"Brisa Cítrica · laranja","price":0},{"id":"caip-kiwi","name":"Caip Kiwi · kiwi","price":0},{"id":"sertao-refrescante","name":"Sertão Refrescante · caju","price":0},{"id":"pina-louca","name":"Pina Louca · abacaxi","price":0},{"id":"duas-caras","name":"Duas Caras · limão e maracujá","price":0},{"id":"choppirinha","name":"Choppirinha · cerveja","price":0},{"id":"dama-de-vermelho","name":"Dama de Vermelho · groselha","price":0},{"id":"dankey-kong","name":"Dankey Kong · banana","price":0},{"id":"hortelzinha","name":"Hortelzinha · hortelã","price":0},{"id":"caipibrown","name":"Caipibrown · morena","price":0},{"id":"suica-gelada","name":"Suíça Gelada · suíça","price":0},{"id":"camparinha","name":"Camparinha · Campari","price":0},{"id":"caipigabi","name":"Caipigabi · Gabriela","price":0},{"id":"caiperol","name":"Caiperol · Aperol","price":0},{"id":"caipipacoca","name":"Caipipaçoca · paçoca e leite condensado","price":0},{"id":"kiuvinha","name":"Kiuvinha · kiwi e uvas verdes","price":0}]}]'::jsonb, null)
on conflict (id) do nothing;

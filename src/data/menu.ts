import type { AddonGroup, Category, CategorySlug, Product } from '../types/index.ts';

/** Preços e itens dos PDFs oficiais do Seu Paulo Buteco. */
export const CATEGORIES: Category[] = [
  { id: 'c1', slug: 'petiscos', name: 'Petiscos', emoji: '🍟', sortOrder: 1 },
  { id: 'c2', slug: 'porcoes', name: 'Porções', emoji: '🍽️', sortOrder: 2 },
  { id: 'c3', slug: 'pratos', name: 'Almoço', emoji: '🥩', sortOrder: 3 },
  { id: 'c8', slug: 'sobremesas', name: 'Sobremesas', emoji: '🥥', sortOrder: 4 },
  { id: 'c5', slug: 'drinks', name: 'Drinks & Caipirinhas', emoji: '🍹', sortOrder: 5 },
  { id: 'c6', slug: 'cervejas', name: 'Cervejas', emoji: '🍺', sortOrder: 6 },
  { id: 'c7', slug: 'bebidas', name: 'Bebidas', emoji: '🥤', sortOrder: 7 },
];

function escolha(id: string, name: string, options: [string, string][]): AddonGroup {
  return {
    id, name, type: 'single', required: true, min: 1, max: 1,
    options: options.map(([optionId, optionName]) => ({ id: optionId, name: optionName, price: 0 })),
  };
}

type Item = [
  id: string, nome: string, preco: number, descricao?: string, opcoes?: AddonGroup[],
  dias?: number[],
];

function produtos(categorySlug: CategorySlug, items: Item[]): Product[] {
  return items.map(([id, name, price, description = '', addonGroups = [], availableWeekdays]) => ({
    id: 'menu-' + id, categorySlug, name, price, description, addonGroups, availableWeekdays,
    image: '/mark.png', available: true,
  }));
}

const diasFixos = [2, 3, 4, 5];
const salada = 'Acompanha a salada do dia.';
const acompanhamentos = 'Acompanha feijão carioca, arroz branco, farofa da casa, ovo frito e salada do dia.';

const saboresCaipirinha = escolha('sabor', 'Escolha a caipirinha', [
  ['nunca-erra', 'Nunca Erra · limão'],
  ['maranguita', 'Maranguita · morango'],
  ['calmaria-acida', 'Calmaria Ácida · maracujá'],
  ['samba-no-calice', 'Samba no Cálice · vinho'],
  ['brisa-citrica', 'Brisa Cítrica · laranja'],
  ['caip-kiwi', 'Caip Kiwi · kiwi'],
  ['sertao-refrescante', 'Sertão Refrescante · caju'],
  ['pina-louca', 'Pina Louca · abacaxi'],
  ['duas-caras', 'Duas Caras · limão e maracujá'],
  ['choppirinha', 'Choppirinha · cerveja'],
  ['dama-de-vermelho', 'Dama de Vermelho · groselha'],
  ['dankey-kong', 'Dankey Kong · banana'],
  ['hortelzinha', 'Hortelzinha · hortelã'],
  ['caipibrown', 'Caipibrown · morena'],
  ['suica-gelada', 'Suíça Gelada · suíça'],
  ['camparinha', 'Camparinha · Campari'],
  ['caipigabi', 'Caipigabi · Gabriela'],
  ['caiperol', 'Caiperol · Aperol'],
  ['caipipacoca', 'Caipipaçoca · paçoca e leite condensado'],
  ['kiuvinha', 'Kiuvinha · kiwi e uvas verdes'],
]);

export const PRODUCTS = [
  ...produtos('pratos', [
    ['virado-a-paulista', 'Virado à Paulista', 38.90, 'Bisteca suína, linguiça, tutu de feijão, arroz branco, banana frita, couve refogada e ovo frito. ' + salada, [], [2]],
    ['picanha-com-fritas', 'Picanha com Fritas', 38.90, 'Com arroz de alho, feijão vermelho, farofa da casa, fritas e ovo frito. ' + salada, [], [3]],
    ['fraldinha-molho-madeira', 'Fraldinha ao Molho Madeira', 38.90, 'Com arroz, feijão carioca, farofa da casa, purê de batata e ovo frito. ' + salada, [], [4]],
    ['feijoada-da-casa', 'Feijoada da Casa', 38.90, 'Com arroz, farofa da casa, couve na manteiga, laranja, torresmo e ovo frito. ' + salada, [], [5]],
    ['espaguete-bolonhesa', 'Espaguete à Bolonhesa', 32.90, 'Com fraldinha e salada do dia.', [], [4]],
    ['tilapia-empanada', 'Tilápia Empanada', 32.90, acompanhamentos, [], [5]],
    ['bife-de-boi', 'Bife de Boi', 34.90, 'A cavalo ou acebolado. ' + acompanhamentos,
      [escolha('preparo', 'Preparo', [['a-cavalo', 'A cavalo'], ['acebolado', 'Acebolado']])], diasFixos],
    ['almondegas-ao-molho', 'Almôndegas ao Molho', 34.90, acompanhamentos, [], diasFixos],
    ['file-de-frango-grelhado', 'Filé de Frango Grelhado', 31.90, acompanhamentos, [], diasFixos],
    ['grao-de-bico-ou-soja', 'Grão-de-bico ou Soja', 32.90, acompanhamentos,
      [escolha('opcao', 'Escolha uma opção', [['grao-de-bico', 'Grão-de-bico'], ['soja', 'Soja']])], diasFixos],
  ]),
  ...produtos('petiscos', [
    ['pastel-seu-paulo', 'Pastel Seu Paulo (unidade)', 14.00, 'Acompanha vinagrete.',
      [escolha('recheio', 'Recheio', [['carne-ovo', 'Carne com ovo'], ['canastra', 'Queijo Canastra'], ['frango-quiabo', 'Frango com quiabo']])]],
    ['bolinho-costela', 'Bolinho de Costela (8 unidades)', 37.90, 'Costela desfiada e tempero da casa.'],
    ['bolinho-carne-paulista', 'Bolinho de Carne Paulista (8 unidades)', 32.90, 'Bolinho frito com tempero paulista.'],
    ['coxinhas-seu-paulo', 'Coxinhas Seu Paulo (8 unidades)', 31.90, 'Coxinhas de frango com molho da casa.'],
    ['jilo-empanado', 'Jiló Empanado', 25.00, 'Empanado no queijo parmesão.'],
    ['pipoquinha-quiabo', 'Pipoquinha de Quiabo', 25.00, 'Quiabo em pedaços pequenos, empanado e frito.'],
    ['combinado-seu-paulo', 'Combinado Seu Paulo', 49.90, '1 pastel Seu Paulo, 3 bolinhos de carne paulista, 3 coxinhas e 3 bolinhos de costela.'],
    ['sacanagem', 'Sacanagem', 21.00, 'Espetinho de pimentão e cenoura envolto em mortadela defumada em conserva.'],
    ['mix-conservas', 'Mix de Conservas Seu Paulo', 29.00, 'Muçarela em cubos com acepipes e temperos da casa.'],
  ]),
  ...produtos('porcoes', [
    ['file-aperitivo-seu-paulo', 'Filé Aperitivo Seu Paulo', 59.00, 'Contrafilé com rúcula, tomate seco e queijo.'],
    ['file-aperitivo-da-roca', 'Filé Aperitivo da Roça', 69.00, 'Contrafilé com fritas, pimenta biquinho e molho da casa.'],
    ['frango-passarinho-paulista', 'Frango à Passarinho Paulista', 32.00, 'Frango frito com alho.'],
    ['isca-frango', 'Isca de Frango', 35.00, 'Frango crocante com molho da casa.'],
    ['torresmo-seu-paulo', 'Torresmo Seu Paulo', 36.90, 'Barriga de porco curada e frita.'],
    ['jilo-bacon', 'Jiló Recheado com Bacon', 35.00, 'Jiló empanado com recheio de bacon e molho da casa.'],
    ['moela', 'Moela', 32.90, 'Moela cozida com cheiro-verde, picles de cebola e pão de sal.'],
    ['coracaozinho', 'Coraçãozinho', 39.90, 'Coração de frango na chapa com alho, cheiro-verde e picles de cebola.'],
    ['carne-de-panela', 'Carne de Panela', 39.90, 'Carne cozida na cerveja preta com temperos da casa. Acompanha pão de sal.'],
    ['vaca-atolada', 'Vaca Atolada', 38.00, 'Costela cozida com mandioca e pão de sal.'],
    ['pescoco-de-peru', 'Pescoço de Peru', 38.00, 'Pescoço de peru cozido e dourado com pão de sal.'],
    ['fritas', 'Fritas', 25.00, 'Batata frita crocante.'],
    ['mandioca-aperitivo', 'Mandioca Aperitivo', 27.00, 'Mandioca cozida na manteiga.'],
  ]),
  ...produtos('sobremesas', [
    ['cocada-caseira', 'Cocada Caseira', 15.00],
  ]),
  ...produtos('cervejas', [
    ['amstel-600', 'Amstel 600 ml', 15.00],
    ['heineken-600', 'Heineken 600 ml', 18.00],
    ['baden-baden-600', 'Baden Baden 600 ml', 24.00],
    ['original-600', 'Original 600 ml', 16.00],
    ['spaten-600', 'Spaten 600 ml', 16.00],
    ['stella-pure-gold-600', 'Stella Pure Gold 600 ml', 18.00],
    ['chope-amstel', 'Chope Amstel', 12.00],
    ['chope-heineken', 'Chope Heineken', 14.00],
    ['chope-brahma', 'Chope Brahma', 12.00],
    ['amstel-ultra-long-neck', 'Amstel Ultra Long Neck', 14.00, 'Sem glúten.'],
    ['heineken-long-neck', 'Heineken Long Neck', 14.00],
    ['heineken-zero-long-neck', 'Heineken Zero Long Neck', 14.00],
    ['praya-long-neck', 'Praya Long Neck', 14.00],
    ['stella-pure-gold-long-neck', 'Stella Pure Gold Long Neck', 14.00],
    ['corona-long-neck', 'Corona Long Neck', 14.00],
    ['corona-zero-long-neck', 'Corona Zero Long Neck', 14.00],
  ]),
  ...produtos('bebidas', [
    ['amstel-vibes-morango', 'Amstel Vibes Morango', 12.00],
    ['amstel-vibes-limao', 'Amstel Vibes Limão', 12.00],
    ['xeque-mate', 'Xeque Mate', 17.00, 'Com gelo e limão.'],
    ['refrigerante', 'Refrigerante KS/Lata', 6.00, undefined,
      [escolha('sabor', 'Refrigerante', [['guarana', 'Guaraná'], ['coca-cola', 'Coca-Cola'], ['coca-zero', 'Coca-Cola Zero'], ['pepsi-black', 'Pepsi Black']])]],
    ['itubaina', 'Itubaína', 8.00],
    ['suco-del-valle', 'Suco Del Valle', 6.00],
    ['red-bull', 'Red Bull', 18.00],
    ['mamba-water-sem-gas', 'Mamba Water sem Gás', 6.00],
    ['mamba-water-com-gas', 'Mamba Water com Gás', 6.00],
    ['fys-tonica', 'FYS Tônica', 6.00],
    ['agua-tonica', 'Água Tônica', 7.00],
    ['agua-sem-gas', 'Água sem Gás', 4.00],
    ['agua-com-gas', 'Água com Gás', 5.00],
    ['cafe-expresso', 'Café Expresso', 7.00],
  ]),
  ...produtos('drinks', [
    ['vaquinha', 'Vaquinha', 22.00],
    ['licor-43', 'Licor 43', 29.00],
    ['licor-43-vaquinha', 'Licor 43 Vaquinha', 35.00],
    ['campari', 'Campari', 19.00],
    ['whisky', 'Whisky', 25.00],
    ['tequila-jose-cuervo-gold', 'Tequila José Cuervo Gold', 25.00],
    ['gin', 'Gin', 25.00],
    ['gabriela', 'Gabriela', 11.00],
    ['cachaca', 'Cachaça', 9.00, undefined,
      [escolha('marca', 'Cachaça', [['seleta', 'Seleta'], ['salinas', 'Salinas'], ['da-roca', 'Da Roça']])]],
    ['moscow-mule', 'Moscow Mule', 25.00, 'Vodka, Monin de gengibre, limão, água com gás e espuma de gengibre.'],
    ['fitz-geraldim', 'Fitz Geraldim', 29.00, 'Gin, limão, açúcar e angostura.'],
    ['negroni', 'Negroni', 32.00, 'Gin, vermute rosso, Campari e casca de laranja.'],
    ['gin-tonica', 'Gin Tônica', 32.00, 'Gin, limão e água tônica.'],
    ['gin-tropical', 'Gin Tropical', 32.00, 'Gin, laranja e energético tropical.'],
    ['aperol-spritz', 'Aperol Spritz', 35.00, 'Prosecco, Aperol, água com gás e laranja.'],
    ['cozumel', 'Cozumel', 32.00, 'Borda de sal, tequila, limão e Corona.'],
    ['maracujack', 'Maracujack', 32.00, 'Jack Daniel’s, maracujá, xarope simples e hortelã.'],
    ['seu-43', 'Seu 43', 45.00, 'Licor 43, limão, Sprite e espuma de gengibre.'],
    ['carajillo', 'Carajillo', 35.00, 'Licor 43 e café expresso.'],
    ['rosa-caiana', 'Rosa Caiana', 32.00, 'Gabriela, xarope de gengibre e limão.'],
    ['morangin', 'Morangin', 35.00, 'Morango, gin e soda limonada.'],
    ['campari-black', 'Campari Black', 32.00, 'Campari e Pepsi Black.'],
    ['tinto-do-verano', 'Tinto do Verano', 32.00, 'Vinho tinto suave e soda italiana.'],
    ['sunset-spritz', 'Sunset Spritz', 32.00, 'Corona e Aperol Spritz.'],
    ['morito-morango', 'Morito Morango', 35.00, 'Rum, morango, hortelã e água com gás.'],
    ['london-mule', 'London Mule', 32.00, 'Gin, limão, xarope de gengibre, angostura e soda italiana.'],
    ['caipirinha-seu-paulo', 'Caipirinha Seu Paulo', 23.00, undefined, [saboresCaipirinha]],
    ['caip-vodka-seu-paulo', 'Caip Vodka Seu Paulo', 26.00, undefined, [saboresCaipirinha]],
  ]),
];

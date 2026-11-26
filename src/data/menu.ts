import type { AddonGroup, Category, CategorySlug, Product } from '../types/index.ts';

/** Pratos de almoço e fritas disponíveis no Delivery. */
export const CATEGORIES: Category[] = [
  { id: 'c3', slug: 'pratos', name: 'Almoço', emoji: '🥩', sortOrder: 3 },
  { id: 'c2', slug: 'porcoes', name: 'Acompanhamento', emoji: '🍽️', sortOrder: 4 },
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

const diasFixos = [0, 2, 3, 4, 5, 6];
const salada = 'Acompanha a salada do dia.';
const acompanhamentos = 'Acompanha feijão carioca, arroz branco, farofa da casa, ovo frito e salada do dia.';

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
  ...produtos('porcoes', [
    ['fritas', 'Fritas', 25.00, 'Batata frita crocante.'],
  ]),
];

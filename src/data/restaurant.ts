import type { LatLng } from '@/types';

/**
 * Dados reais do Seu Paulo Buteco (unidade da Angola, Betim/MG).
 * Fonte: site oficial e bio do Instagram @seupaulobuteco.
 */
export const RESTAURANT = {
  name: 'Seu Paulo Buteco',
  brand: 'Seu Paulo Delivery',
  tagline: 'O buteco na palma da mão',
  address: 'Rua Milton Vieira Pinto, 16',
  neighborhood: 'Angola',
  city: 'Betim',
  state: 'MG',
  zip: '32604-148',
  phoneDisplay: '(31) 7352-9146',
  phoneLink: '+553173529146',
  whatsapp: 'https://wa.me/553173529146',
  instagram: 'https://www.instagram.com/seupaulobuteco/',
  instagramHandle: '@seupaulobuteco',
  /**
   * Coordenadas da casa — Rua Milton Vieira Pinto (CEP 32604-148), Betim/MG.
   * Verificadas por geocodificação do endereço no OpenStreetMap (batem com o
   * nome da rua e o CEP oficiais). É daqui que TODA entrega parte.
   */
  location: { lat: -19.9599330, lng: -44.1999790 } as LatLng,
  /** Raio de entrega em km (referência para o aviso; não bloqueia o pedido). */
  deliveryRadiusKm: 25,
  /** Taxa base + por km, usada no cálculo do frete. */
  deliveryBaseFee: 4.99,
  deliveryPerKm: 1.6,
  minOrder: 20,
  avgPrepMinutes: 25,
} as const;

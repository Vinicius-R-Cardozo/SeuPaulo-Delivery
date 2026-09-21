import type { LatLng } from '@/types';

/**
 * Dados reais do Seu Paulo Buteco (unidade da Angola, Betim/MG).
 * Fonte: site oficial e bio do Instagram @seupaulobuteco.
 */
export const RESTAURANT = {
  name: 'Seu Paulo Buteco',
  brand: 'Seu Paulo Delivery',
  tagline: 'O buteco na palma da mão',
  address: 'R. Milton Viêra Pinto, 16',
  neighborhood: 'Angola',
  city: 'Betim',
  state: 'MG',
  zip: '32653-456',
  phoneDisplay: '(31) 7352-9146',
  phoneLink: '+553173529146',
  whatsapp: 'https://wa.me/553173529146',
  instagram: 'https://www.instagram.com/seupaulobuteco/',
  instagramHandle: '@seupaulobuteco',
  /** Coordenadas da casa (extraídas do embed do Google Maps do site). */
  location: { lat: -19.9503895, lng: -44.2166209 } as LatLng,
  /** Raio de entrega em km. */
  deliveryRadiusKm: 8,
  /** Taxa base + por km, usada no cálculo do frete. */
  deliveryBaseFee: 4.99,
  deliveryPerKm: 1.6,
  minOrder: 20,
  avgPrepMinutes: 25,
} as const;

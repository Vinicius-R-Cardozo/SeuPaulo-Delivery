import type { LatLng } from '@/types';
import { RESTAURANT } from '@/data/restaurant';

/** Distância em km entre dois pontos (fórmula de Haversine). */
export function haversineKm(a: LatLng, b: LatLng): number {
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return R * 2 * Math.asin(Math.sqrt(h));
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** Frete a partir da distância até o restaurante. */
export function calcDeliveryFee(destination: LatLng): number {
  const km = haversineKm(RESTAURANT.location, destination);
  const fee = RESTAURANT.deliveryBaseFee + km * RESTAURANT.deliveryPerKm;
  return Math.round(fee * 100) / 100;
}

/** Verifica se o destino está dentro do raio de entrega. */
export function isWithinDeliveryRadius(destination: LatLng): boolean {
  return haversineKm(RESTAURANT.location, destination) <= RESTAURANT.deliveryRadiusKm;
}

/** ETA aproximado em minutos (preparo + trajeto a ~22 km/h no trânsito urbano). */
export function estimateEtaMinutes(destination: LatLng, includePrep = true): number {
  const travel = travelMinutes(RESTAURANT.location, destination);
  const prep = includePrep ? RESTAURANT.avgPrepMinutes : 0;
  return Math.max(5, Math.round(prep + travel));
}

/** Estimativa do tempo restante, a partir da última localização do entregador. */
export function estimateRemainingDeliveryMinutes(driver: LatLng, destination: LatLng): number {
  return Math.max(1, Math.ceil(travelMinutes(driver, destination)));
}

function travelMinutes(origin: LatLng, destination: LatLng): number {
  return (haversineKm(origin, destination) / 22) * 60;
}

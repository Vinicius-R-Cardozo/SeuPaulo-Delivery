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
  const km = haversineKm(RESTAURANT.location, destination);
  const travel = (km / 22) * 60;
  const prep = includePrep ? RESTAURANT.avgPrepMinutes : 0;
  return Math.max(5, Math.round(prep + travel));
}

/**
 * Gera uma polilinha simples (com leve curvatura) entre dois pontos.
 * Usada para desenhar a rota e animar o entregador no mapa.
 */
export function buildRoute(from: LatLng, to: LatLng, steps = 40): LatLng[] {
  const points: LatLng[] = [];
  // Ponto de controle deslocado para simular ruas, não uma linha reta.
  const mx = (from.lat + to.lat) / 2 + (to.lng - from.lng) * 0.08;
  const my = (from.lng + to.lng) / 2 - (to.lat - from.lat) * 0.08;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const lat = quad(from.lat, mx, to.lat, t);
    const lng = quad(from.lng, my, to.lng, t);
    points.push({ lat, lng });
  }
  return points;
}

/** Interpolação quadrática de Bézier. */
function quad(p0: number, p1: number, p2: number, t: number): number {
  const mt = 1 - t;
  return mt * mt * p0 + 2 * mt * t * p1 + t * t * p2;
}

/** Ponto ao longo de uma rota dado um progresso de 0 a 1. */
export function pointAlongRoute(route: LatLng[], progress: number): LatLng {
  if (route.length === 0) return RESTAURANT.location;
  const clamped = Math.max(0, Math.min(1, progress));
  const idx = clamped * (route.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return route[lo];
  const frac = idx - lo;
  return {
    lat: route[lo].lat + (route[hi].lat - route[lo].lat) * frac,
    lng: route[lo].lng + (route[hi].lng - route[lo].lng) * frac,
  };
}

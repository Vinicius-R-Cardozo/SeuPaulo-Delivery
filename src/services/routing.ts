import type { LatLng } from '@/types';
import { buildRoute, haversineKm } from '@/utils/geo';
import { RESTAURANT } from '@/data/restaurant';

/**
 * Rota real por ruas para a entrega. Toda entrega parte do Seu Paulo
 * (RESTAURANT.location) até o cliente.
 *
 * Provedor atual: OSRM público (https://router.project-osrm.org) — gratuito e
 * sem chave. Mesmo papel do /maps/directions do LuxDrive (que usa Google atrás
 * do backend), mas isolado neste serviço: para trocar por Mapbox/Google/OSRM
 * self-hosted depois, basta reimplementar `fetchRoute` — o resto não muda.
 *
 * Se a consulta falhar (offline, limite, timeout), cai numa curva sintética +
 * distância em linha reta, para o mapa nunca quebrar.
 */
export interface RouteResult {
  /** polilinha seguindo as ruas (origem → destino) */
  coordinates: LatLng[];
  distanceKm: number;
  durationMin: number;
  provider: 'osrm' | 'fallback';
}

const OSRM = 'https://router.project-osrm.org/route/v1/driving';
const cache = new Map<string, RouteResult>();

function key(from: LatLng, to: LatLng): string {
  return `${from.lat.toFixed(5)},${from.lng.toFixed(5)}->${to.lat.toFixed(5)},${to.lng.toFixed(5)}`;
}

function fallback(from: LatLng, to: LatLng): RouteResult {
  const km = haversineKm(from, to);
  return {
    coordinates: buildRoute(from, to),
    distanceKm: km,
    durationMin: Math.max(1, Math.round((km / 22) * 60)),
    provider: 'fallback',
  };
}

/**
 * Rota do restaurante (padrão: Seu Paulo) até o destino. Resultado é
 * memoizado por par de coordenadas (rotas de entrega não mudam).
 */
export async function getDeliveryRoute(
  to: LatLng,
  from: LatLng = RESTAURANT.location,
): Promise<RouteResult> {
  const k = key(from, to);
  const cached = cache.get(k);
  if (cached) return cached;

  try {
    const url = `${OSRM}/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (res.ok) {
      const data = (await res.json()) as {
        routes?: { distance: number; duration: number; geometry: { coordinates: [number, number][] } }[];
      };
      const route = data.routes?.[0];
      if (route?.geometry?.coordinates?.length) {
        const result: RouteResult = {
          coordinates: route.geometry.coordinates.map(([lng, lat]) => ({ lat, lng })),
          distanceKm: route.distance / 1000,
          durationMin: Math.max(1, Math.round(route.duration / 60)),
          provider: 'osrm',
        };
        cache.set(k, result);
        return result;
      }
    }
  } catch {
    /* rede/limite/timeout → usa o fallback abaixo */
  }
  const fb = fallback(from, to);
  cache.set(k, fb);
  return fb;
}

import type { LatLng } from '@/types';
import { RESTAURANT } from '@/data/restaurant';

/**
 * Rota real por ruas para a entrega. Toda entrega parte do Seu Paulo
 * (RESTAURANT.location) até o cliente.
 *
 * Provedor atual: OSRM público (https://router.project-osrm.org) — gratuito e
 * sem chave. Mesmo papel do /maps/directions do LuxDrive (que usa Google atrás
 * do backend), mas isolado neste serviço: para trocar por Mapbox/Google/OSRM
 * self-hosted depois, basta reimplementar `fetchRoute` — o resto não muda.
 */

const OSRM = 'https://router.project-osrm.org/route/v1/driving';
const cache = new Map<string, LatLng[]>();

function key(from: LatLng, to: LatLng): string {
  return `${from.lat.toFixed(5)},${from.lng.toFixed(5)}->${to.lat.toFixed(5)},${to.lng.toFixed(5)}`;
}

/**
 * Rota do restaurante (padrão: Seu Paulo) até o destino. Resultado é
 * memoizado por par de coordenadas (rotas de entrega não mudam).
 */
export async function getDeliveryRoute(
  to: LatLng,
  from: LatLng = RESTAURANT.location,
): Promise<LatLng[]> {
  const k = key(from, to);
  const cached = cache.get(k);
  if (cached) return cached;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  try {
    const url = `${OSRM}/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`;
    const res = await fetch(url, { signal: controller.signal });
    if (res.ok) {
      const data = (await res.json()) as {
        routes?: { geometry: { coordinates: [number, number][] } }[];
      };
      const route = data.routes?.[0];
      if (route?.geometry?.coordinates?.length) {
        const coordinates = route.geometry.coordinates.map(([lng, lat]) => ({ lat, lng }));
        cache.set(k, coordinates);
        return coordinates;
      }
    }
  } catch {
    // Sem rota confirmada, o mapa mantém os marcadores.
  } finally {
    clearTimeout(timer);
  }
  return [];
}

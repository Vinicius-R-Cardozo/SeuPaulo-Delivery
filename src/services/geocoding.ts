import type { LatLng } from '@/types';

/**
 * Geocodificação via Nominatim (OpenStreetMap) — sem chave de API.
 * Para produção com alto volume, troque por um provedor com plano dedicado
 * (Mapbox, Google, LocationIQ) respeitando os limites de uso. Ver README.
 */

const BASE = 'https://nominatim.openstreetmap.org';

export interface GeocodeResult {
  displayName: string;
  lat: number;
  lng: number;
  street?: string;
  number?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  zip?: string;
}

interface NominatimAddress {
  road?: string;
  house_number?: string;
  suburb?: string;
  neighbourhood?: string;
  city?: string;
  town?: string;
  village?: string;
  state?: string;
  postcode?: string;
}

function mapAddress(a: NominatimAddress | undefined) {
  return {
    street: a?.road,
    number: a?.house_number,
    neighborhood: a?.suburb ?? a?.neighbourhood,
    city: a?.city ?? a?.town ?? a?.village,
    state: a?.state,
    zip: a?.postcode,
  };
}

export async function searchAddress(query: string): Promise<GeocodeResult[]> {
  if (query.trim().length < 3) return [];
  const url = `${BASE}/search?format=jsonv2&addressdetails=1&limit=6&countrycodes=br&q=${encodeURIComponent(
    query,
  )}`;
  const res = await fetch(url, { headers: { 'Accept-Language': 'pt-BR' } });
  if (!res.ok) throw new Error('Falha ao buscar endereço.');
  const data = (await res.json()) as Array<{
    display_name: string;
    lat: string;
    lon: string;
    address?: NominatimAddress;
  }>;
  return data.map((d) => ({
    displayName: d.display_name,
    lat: Number(d.lat),
    lng: Number(d.lon),
    ...mapAddress(d.address),
  }));
}

export async function reverseGeocode(point: LatLng): Promise<GeocodeResult> {
  const url = `${BASE}/reverse?format=jsonv2&addressdetails=1&lat=${point.lat}&lon=${point.lng}`;
  const res = await fetch(url, { headers: { 'Accept-Language': 'pt-BR' } });
  if (!res.ok) throw new Error('Falha ao identificar o endereço.');
  const d = (await res.json()) as {
    display_name: string;
    address?: NominatimAddress;
  };
  return {
    displayName: d.display_name,
    lat: point.lat,
    lng: point.lng,
    ...mapAddress(d.address),
  };
}

import type { LatLng } from '@/types';
import { RESTAURANT } from '@/data/restaurant';

/**
 * Geocodificação via Nominatim (OpenStreetMap) — sem chave de API.
 * Para produção com alto volume, troque por um provedor com plano dedicado
 * (Mapbox, Google, LocationIQ) respeitando os limites de uso. Ver README.
 */

const BASE = 'https://nominatim.openstreetmap.org';
const PHOTON_URL = import.meta.env.VITE_ADDRESS_AUTOCOMPLETE_URL?.trim();
const { lat, lng } = RESTAURANT.location;
// Prioriza a região de entrega e permite resultados de outras cidades.
const DELIVERY_VIEWBOX = [lng - 0.3, lat + 0.3, lng + 0.3, lat - 0.3].join(',');

export const isAddressAutocompleteEnabled = Boolean(PHOTON_URL);

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
  const q = query.trim();
  if (q.length < 3) return [];
  const params = new URLSearchParams({
    format: 'jsonv2',
    addressdetails: '1',
    limit: '20',
    countrycodes: 'br',
    viewbox: DELIVERY_VIEWBOX,
    q,
  });
  const res = await fetch(`${BASE}/search?${params}`, { headers: { 'Accept-Language': 'pt-BR' } });
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

interface PhotonFeature {
  geometry: { coordinates: [number, number] };
  properties: {
    type?: string;
    name?: string;
    street?: string;
    housenumber?: string;
    district?: string;
    locality?: string;
    city?: string;
    state?: string;
    postcode?: string;
    country?: string;
  };
}

export async function suggestAddresses(query: string, signal: AbortSignal): Promise<GeocodeResult[]> {
  if (!PHOTON_URL) return [];
  const url = new URL(PHOTON_URL);
  url.searchParams.set('q', query);
  url.searchParams.set('limit', '20');
  url.searchParams.set('countrycode', 'BR');
  url.searchParams.set('lat', String(lat));
  url.searchParams.set('lon', String(lng));
  url.searchParams.set('zoom', '11');

  const response = await fetch(url, { signal, headers: { 'Accept-Language': 'pt-BR' } });
  if (!response.ok) throw new Error('Falha ao carregar sugestões de endereço.');
  const { features } = await response.json() as { features: PhotonFeature[] };

  return features.map(({ properties, geometry }) => {
    const [lng, lat] = geometry.coordinates;
    const street = properties.street ?? (properties.type === 'street' ? properties.name : undefined);
    const number = properties.housenumber;
    const neighborhood = properties.district ?? properties.locality;
    const { city, state, postcode: zip } = properties;
    const displayName = [...new Set([
      properties.name, street, number, neighborhood, city, state, zip, properties.country,
    ].filter(Boolean))].join(', ');
    return { displayName, lat, lng, street, number, neighborhood, city, state, zip };
  });
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

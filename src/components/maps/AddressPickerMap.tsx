import { useEffect, useRef } from 'react';
import L from 'leaflet';
import type { LatLng } from '@/types';
import { customerIcon } from './mapIcons';

const TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';

/**
 * Mapa interativo para posicionar/ajustar o marcador de entrega.
 * O usuário pode tocar no mapa ou arrastar o pino — a cada ajuste devolvemos
 * as coordenadas por `onChange`, que alimentam o fluxo do pedido.
 */
export function AddressPickerMap({
  value,
  onChange,
  className = 'h-full w-full',
}: {
  value: LatLng;
  onChange: (p: LatLng) => void;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, { center: [value.lat, value.lng], zoom: 16 });
    L.tileLayer(TILE_URL, { attribution: '&copy; OpenStreetMap', maxZoom: 19 }).addTo(map);
    const marker = L.marker([value.lat, value.lng], {
      icon: customerIcon(),
      draggable: true,
    }).addTo(map);
    marker.on('dragend', () => {
      const { lat, lng } = marker.getLatLng();
      onChangeRef.current({ lat, lng });
    });
    map.on('click', (e: L.LeafletMouseEvent) => {
      marker.setLatLng(e.latlng);
      onChangeRef.current({ lat: e.latlng.lat, lng: e.latlng.lng });
    });
    mapRef.current = map;
    markerRef.current = marker;
    setTimeout(() => map.invalidateSize(), 120);
    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Recentraliza quando o valor muda por fora (geolocalização/busca).
  useEffect(() => {
    const map = mapRef.current;
    const marker = markerRef.current;
    if (!map || !marker) return;
    marker.setLatLng([value.lat, value.lng]);
    map.setView([value.lat, value.lng], map.getZoom());
  }, [value.lat, value.lng]);

  return <div ref={containerRef} className={className} />;
}

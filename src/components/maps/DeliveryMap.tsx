import { useEffect, useRef } from 'react';
import L from 'leaflet';
import type { LatLng } from '@/types';
import { getDeliveryRoute } from '@/services/routing';
import { restaurantIcon, customerIcon, driverIcon } from './mapIcons';

const TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const TILE_ATTR = '&copy; OpenStreetMap';

interface DeliveryMapProps {
  restaurant: LatLng;
  customer?: LatLng | null;
  driver?: LatLng | null;
  /** desenha a rota restaurante → cliente */
  showRoute?: boolean;
  className?: string;
  /** recentraliza para enquadrar todos os pontos quando muda */
  fitKey?: string | number;
}

/**
 * Mapa de acompanhamento em tempo real. Estrutura inspirada na tela de
 * live-race da LuxDrive (motorista → passageiro), adaptada para delivery:
 * restaurante (origem) → cliente (destino) → entregador (marcador móvel).
 */
export function DeliveryMap({
  restaurant,
  customer,
  driver,
  showRoute = true,
  className = 'h-full w-full',
  fitKey,
}: DeliveryMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markers = useRef<{ restaurant?: L.Marker; customer?: L.Marker; driver?: L.Marker }>({});
  const routeLine = useRef<L.Polyline | null>(null);
  // Guarda os pontos atuais para o ResizeObserver reenquadrar sem depender de props.
  const pointsRef = useRef<{ restaurant: LatLng; customer?: LatLng | null; driver?: LatLng | null }>({
    restaurant,
  });
  pointsRef.current = { restaurant, customer, driver };

  const fitToPoints = () => {
    const map = mapRef.current;
    if (!map) return;
    map.invalidateSize();
    const { restaurant: r, customer: c, driver: d } = pointsRef.current;
    const pts: L.LatLngExpression[] = [[r.lat, r.lng]];
    if (c) pts.push([c.lat, c.lng]);
    if (d) pts.push([d.lat, d.lng]);
    if (pts.length === 1) map.setView(pts[0], 15);
    else map.fitBounds(L.latLngBounds(pts).pad(0.35), { maxZoom: 16 });
  };

  // Cria o mapa uma vez.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, {
      center: [restaurant.lat, restaurant.lng],
      zoom: 14,
      zoomControl: true,
      attributionControl: true,
    });
    L.tileLayer(TILE_URL, { attribution: TILE_ATTR, maxZoom: 19 }).addTo(map);
    mapRef.current = map;
    markers.current.restaurant = L.marker([restaurant.lat, restaurant.lng], {
      icon: restaurantIcon(),
    }).addTo(map);

    // Reenquadra sempre que o container ganhar/mudar de tamanho (resolve o caso
    // em que o mapa é montado dentro de um painel que só depois recebe dimensão).
    const ro = new ResizeObserver(() => fitToPoints());
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      map.remove();
      mapRef.current = null;
      markers.current = {};
      routeLine.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Marcador do cliente + rota real (por ruas) do Seu Paulo até o cliente.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !customer) return;

    if (!markers.current.customer) {
      markers.current.customer = L.marker([customer.lat, customer.lng], {
        icon: customerIcon(),
      }).addTo(map);
    } else {
      markers.current.customer.setLatLng([customer.lat, customer.lng]);
    }

    if (!showRoute) return;
    let active = true;
    const drawRoute = (pts: [number, number][]) => {
      if (!active || !mapRef.current) return;
      if (!routeLine.current) {
        routeLine.current = L.polyline(pts, {
          color: '#d9a441',
          weight: 5,
          opacity: 0.9,
          lineJoin: 'round',
          lineCap: 'round',
        }).addTo(map);
      } else {
        routeLine.current.setLatLngs(pts);
      }
    };
    // Rota real seguindo as ruas (com fallback interno se a API falhar).
    void getDeliveryRoute(customer, restaurant).then((r) =>
      drawRoute(r.coordinates.map((p) => [p.lat, p.lng] as [number, number])),
    );
    return () => {
      active = false;
    };
  }, [customer, restaurant, showRoute]);

  // Marcador móvel do entregador.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (driver) {
      if (!markers.current.driver) {
        markers.current.driver = L.marker([driver.lat, driver.lng], { icon: driverIcon() }).addTo(
          map,
        );
      } else {
        markers.current.driver.setLatLng([driver.lat, driver.lng]);
      }
    } else if (markers.current.driver) {
      map.removeLayer(markers.current.driver);
      markers.current.driver = undefined;
    }
  }, [driver]);

  // Reenquadra quando os pontos mudam (e logo após, para o layout estabilizar).
  useEffect(() => {
    if (!mapRef.current) return;
    fitToPoints();
    const t = setTimeout(fitToPoints, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurant, customer, driver, fitKey]);

  return <div ref={containerRef} className={className} />;
}

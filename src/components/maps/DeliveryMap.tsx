import { useEffect, useRef } from 'react';
import L from 'leaflet';
import { LocateFixed, MapPin, Store } from 'lucide-react';
import type { LatLng } from '@/types';
import { restaurantIcon, customerIcon, driverIcon } from './mapIcons';
import { addMapTiles } from './mapTiles';

const DRIVER_MOVE_DURATION_MS = 900;

interface DeliveryMapProps {
  restaurant: LatLng;
  customer?: LatLng | null;
  driver?: LatLng | null;
  className?: string;
  /** Reenquadra o mapa ao entrar em uma nova etapa da entrega. */
  fitKey?: string;
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
  className = 'h-full w-full',
  fitKey,
}: DeliveryMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markers = useRef<{ restaurant?: L.Marker; customer?: L.Marker; driver?: L.Marker }>({});
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
    else map.fitBounds(L.latLngBounds(pts), { padding: [48, 42], maxZoom: 16, animate: false });
  };

  // Cria o mapa uma vez.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, {
      center: [restaurant.lat, restaurant.lng],
      zoom: 14,
      zoomControl: false,
      zoomAnimation: false,
    });
    addMapTiles(map);
    mapRef.current = map;
    markers.current.restaurant = L.marker([restaurant.lat, restaurant.lng], {
      icon: restaurantIcon(),
      title: 'Seu Paulo Buteco',
    }).bindPopup('Seu Paulo Buteco').addTo(map);

    // Reenquadra sempre que o container ganhar/mudar de tamanho (resolve o caso
    // em que o mapa é montado dentro de um painel que só depois recebe dimensão).
    const ro = new ResizeObserver(() => fitToPoints());
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      map.remove();
      mapRef.current = null;
      markers.current = {};
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (customer) {
      if (!markers.current.customer) {
        markers.current.customer = L.marker([customer.lat, customer.lng], {
          icon: customerIcon(),
          title: 'Endereço de entrega',
        }).bindPopup('Endereço de entrega').addTo(map);
      } else {
        markers.current.customer.setLatLng([customer.lat, customer.lng]);
      }
    } else {
      markers.current.customer?.remove();
      markers.current.customer = undefined;
    }
  }, [customer]);

  const driverLat = driver?.lat;
  const driverLng = driver?.lng;

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const marker = markers.current.driver;
    if (driverLat == null || driverLng == null) {
      marker?.remove();
      markers.current.driver = undefined;
      return;
    }

    const target = L.latLng(driverLat, driverLng);
    if (!marker) {
      markers.current.driver = L.marker(target, {
        icon: driverIcon(),
        title: 'Entregador',
        zIndexOffset: 1000,
      }).bindPopup('Entregador').addTo(map);
      return;
    }

    // Se chegou um ponto novo durante a animação, parte da posição visível.
    const from = marker.getLatLng();
    if (from.equals(target, 0)) return;
    if (document.hidden || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      marker.setLatLng(target);
      return;
    }

    const start = performance.now();
    let frame: number;
    const move = (now: number) => {
      const progress = Math.min(1, (now - start) / DRIVER_MOVE_DURATION_MS);
      if (progress === 1) {
        marker.setLatLng(target);
        return;
      }

      const eased = progress * progress * (3 - 2 * progress);
      marker.setLatLng([
        from.lat + (target.lat - from.lat) * eased,
        from.lng + (target.lng - from.lng) * eased,
      ]);
      frame = requestAnimationFrame(move);
    };
    frame = requestAnimationFrame(move);
    return () => cancelAnimationFrame(frame);
  }, [driverLat, driverLng]);

  const hasDriver = Boolean(driver);

  // Enquadra o primeiro sinal do GPS e deixa o usuário navegar pelo mapa.
  useEffect(() => {
    if (!mapRef.current) return;
    fitToPoints();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurant.lat, restaurant.lng, customer?.lat, customer?.lng, hasDriver, fitKey]);

  return (
    <div className={`flex flex-col ${className}`}>
      <div className="isolate relative min-h-0 flex-1">
        <div ref={containerRef} className="seu-paulo-map absolute inset-0" aria-label="Mapa da entrega" />
        <button
          type="button"
          className="map-recenter absolute left-3 top-3 z-[500]"
          onClick={fitToPoints}
          title="Enquadrar os locais"
          aria-label="Enquadrar os locais"
        >
          <LocateFixed size={17} aria-hidden="true" />
        </button>
      </div>
      <ul aria-label="Legenda do mapa" className="map-legend">
        <li><Store size={15} className="map-legend__restaurant" aria-hidden="true" /> Restaurante</li>
        {customer && <li><MapPin size={15} className="map-legend__destination" aria-hidden="true" /> Destino</li>}
        {driver && <li><span className="map-courier-icon map-legend__courier" aria-hidden="true" /> Entregador</li>}
      </ul>
    </div>
  );
}

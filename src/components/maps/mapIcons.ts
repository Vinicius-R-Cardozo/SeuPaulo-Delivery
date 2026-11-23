import L from 'leaflet';

const symbols = {
  restaurant: '<path d="M3 9h18l-2-5H5L3 9Zm1 0v11h16V9M9 20v-6h6v6M3 9v2a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0V9"/>',
  destination: '<path d="M19 10c0 5-7 10-7 10s-7-5-7-10a7 7 0 1 1 14 0Z"/><circle cx="12" cy="10" r="2.3"/>',
};

function marker(kind: keyof typeof symbols | 'courier') {
  const glyph = kind === 'courier'
    ? '<span class="map-courier-icon" aria-hidden="true"></span>'
    : `<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${symbols[kind]}</svg>`;
  return L.divIcon({
    className: `map-marker map-marker--${kind}`,
    html: `<span class="map-marker__badge">${glyph}</span>`,
    iconSize: [32, 36],
    iconAnchor: [16, 34],
    popupAnchor: [0, -35],
  });
}

export const restaurantIcon = () => marker('restaurant');
export const customerIcon = () => marker('destination');
export const driverIcon = () => marker('courier');

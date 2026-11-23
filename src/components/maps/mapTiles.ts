import L from 'leaflet';

export function addMapTiles(map: L.Map) {
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 19,
  }).addTo(map);

  map.attributionControl.setPrefix(false);
  L.control.zoom({
    position: 'topright',
    zoomInTitle: 'Aproximar',
    zoomOutTitle: 'Afastar',
  }).addTo(map);
}

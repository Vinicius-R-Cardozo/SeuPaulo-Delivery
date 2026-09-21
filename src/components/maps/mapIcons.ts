import L from 'leaflet';

/**
 * Marcadores como divIcon (HTML), evitando o problema clássico das imagens
 * padrão do Leaflet quebrarem sob bundlers. Cada pino usa as cores da marca.
 */

function pin(bg: string, emoji: string, ring = false): L.DivIcon {
  return L.divIcon({
    className: 'spd-pin',
    html: `
      <div style="position:relative;transform:translate(-50%,-100%)">
        ${ring ? `<span style="position:absolute;left:50%;top:14px;width:44px;height:44px;transform:translate(-50%,-50%);border-radius:999px;background:${bg}33;animation:spd-ping 1.6s ease-out infinite"></span>` : ''}
        <div style="width:34px;height:34px;border-radius:999px 999px 999px 2px;background:${bg};display:flex;align-items:center;justify-content:center;font-size:17px;box-shadow:0 6px 16px -4px rgba(0,0,0,.6);border:2px solid #f7f2e8;transform:rotate(45deg)">
          <span style="transform:rotate(-45deg)">${emoji}</span>
        </div>
      </div>`,
    iconSize: [34, 34],
    iconAnchor: [0, 0],
  });
}

export const restaurantIcon = () => pin('#a42129', '🍻');
export const customerIcon = () => pin('#3f9d5a', '📍');
export const driverIcon = () => pin('#d9a441', '🛵', true);

// Injeta a animação de "ping" do pino do entregador uma única vez.
if (typeof document !== 'undefined' && !document.getElementById('spd-map-style')) {
  const style = document.createElement('style');
  style.id = 'spd-map-style';
  style.textContent = `@keyframes spd-ping{0%{transform:translate(-50%,-50%) scale(.6);opacity:.8}80%,100%{transform:translate(-50%,-50%) scale(1.8);opacity:0}}`;
  document.head.appendChild(style);
}

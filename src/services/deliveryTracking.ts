import { Capacitor, registerPlugin } from '@capacitor/core';
import { getSupabase, publicKey, supabaseUrl } from './supabase/client';

interface Trip {
  orderId: string;
  ticket: string;
  endpoint: string;
  apiKey: string;
}

const native = registerPlugin<{
  prepare(): Promise<void>;
  start(trip: Trip): Promise<void>;
  stop(options: { orderId?: string }): Promise<void>;
}>('DeliveryTracker');

export async function prepareTracking() {
  if (Capacitor.isNativePlatform()) return native.prepare();
  await new Promise<void>((resolve, reject) => navigator.geolocation.getCurrentPosition(
    () => resolve(), () => reject(new Error('Permita a localização para iniciar a entrega.')),
    { enableHighAccuracy: true, timeout: 20000 },
  ));
}

// Serializes starts, restores and stops across route changes.
let pending: Promise<void> = Promise.resolve();
let webOrder: string | undefined;
let endWeb: (() => void) | undefined;
function sequence(action: () => Promise<void>) {
  pending = pending.catch(() => {}).then(action);
  return pending;
}

function watchBrowser(trip: Trip) {
  endWeb?.();
  let latest: GeolocationPosition | undefined;
  let sending = false;
  let stopped = false;
  let sentFirst = false;
  let lastCheck = 0;
  const send = async () => {
    if (sending || stopped || (!latest && Date.now() - lastCheck < 30000)) return;
    lastCheck = Date.now();
    const fix = latest;
    sending = true;
    try {
      const { data, error } = await getSupabase().rpc('report_delivery_location', {
        p_order_id: trip.orderId, p_ticket: trip.ticket, p_lat: fix?.coords.latitude ?? null,
        p_lng: fix?.coords.longitude ?? null, p_at: fix ? new Date(fix.timestamp).toISOString() : null,
      });
      if (!error && data === false && !stopped) endWeb?.();
      if (!error && latest === fix) latest = undefined;
    } finally { sending = false; }
  };
  const watch = navigator.geolocation.watchPosition(fix => {
    if (fix.coords.accuracy <= 150) latest = fix;
    if (!sentFirst && latest) { sentFirst = true; void send(); }
  }, undefined, { enableHighAccuracy: true, maximumAge: 0 });
  const timer = window.setInterval(send, 5000);
  webOrder = trip.orderId;
  endWeb = () => {
    stopped = true;
    navigator.geolocation.clearWatch(watch);
    clearInterval(timer);
    webOrder = undefined;
    endWeb = undefined;
  };
}

export const startTracking = (orderId: string) => sequence(async () => {
  if (webOrder === orderId) return;
  const { data, error } = await getSupabase().rpc('delivery_tracking_ticket', { p_order_id: orderId });
  if (error || !data || !publicKey || !supabaseUrl) throw new Error('Não foi possível iniciar o rastreio.');
  const trip = { orderId, ticket: data as string, apiKey: publicKey,
    endpoint: supabaseUrl + '/rest/v1/rpc/report_delivery_location' };
  if (Capacitor.isNativePlatform()) await native.start(trip);
  else watchBrowser(trip);
});

export const stopTracking = (orderId?: string) => sequence(async () => {
  if (Capacitor.isNativePlatform()) await native.stop({ orderId });
  else if (!orderId || orderId === webOrder) endWeb?.();
});

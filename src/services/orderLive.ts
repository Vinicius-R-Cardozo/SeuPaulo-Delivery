import { Capacitor, registerPlugin } from '@capacitor/core';
import type { Order } from '@/types';
import { getSupabase, publicKey, supabaseUrl } from './supabase/client';

interface LiveState {
  orderId: string; revision: number; code: string; title: string; step: number;
  total: number; progress: number; eta: number | null; terminal: boolean;
}
interface Registration { device: string; endpoint: string; apiKey: string; bearer: string }
interface OrderLivePlugin {
  known(): Promise<{ ids: string[]; opened?: string }>;
  display(state: LiveState & Partial<Registration>): Promise<{ token?: string }>;
  clear(): Promise<void>;
}
const native = registerPlugin<OrderLivePlugin>('OrderLive');
const registered = new Map<string, string>();
let generation = 0;
let accountGeneration = 0;

function installation() {
  const key = 'order-live-installation';
  const saved = localStorage.getItem(key);
  if (saved) return saved;
  const id = crypto.randomUUID();
  localStorage.setItem(key, id);
  return id;
}

async function display(state: LiveState, bearer: string) {
  const account = accountGeneration;
  const device = installation();
  const connection = { device, endpoint: supabaseUrl!, apiKey: publicKey! };
  const registration = Capacitor.getPlatform() === 'ios' ? { ...connection, bearer } : connection;
  const result = await native.display({ ...state, ...registration });
  if (account !== accountGeneration) return;
  // ActivityKit registers directly when its asynchronous token arrives.
  if (state.terminal) registered.delete(state.orderId);
  else if (result?.token && registered.get(state.orderId) !== result.token) {
    const { error } = await getSupabase().rpc('register_order_live', {
      p_order: state.orderId, p_installation: device, p_platform: 'android', p_token: result.token,
    });
    if (!error && account === accountGeneration) registered.set(state.orderId, result.token);
  }
}

export async function startCustomerLive(order: Order) {
  if (!Capacitor.isNativePlatform() || order.status !== 'received') return;
  const account = accountGeneration;
  const { data: { session } } = await getSupabase().auth.getSession();
  if (account !== accountGeneration || session?.user.id !== order.customerId) return;
  await display({ orderId: order.id, revision: Date.parse(order.updatedAt), code: order.code,
    title: 'Pedido recebido', step: 1, progress: 1, total: order.fulfillment === 'pickup' ? 5 : 7,
    eta: order.fulfillment === 'delivery' ? order.etaMinutes : null, terminal: false }, session.access_token);
}

// The activity belongs to the customer session, independently of the visible page.
export function followCustomerOrders(customerId: string, open: (id: string) => void) {
  if (!Capacitor.isNativePlatform()) return () => {};
  const epoch = ++generation;
  const db = getSupabase();
  let busy = false;
  let queued = false;
  const refresh = async () => {
    if (epoch !== generation || document.hidden) return;
    if (busy) { queued = true; return; }
    busy = true;
    try {
      const { ids, opened } = await native.known();
      if (epoch !== generation) return;
      if (opened && /^[0-9a-f-]{36}$/i.test(opened)) open(opened);
      const { data, error } = await db.rpc('customer_live_orders', { p_known: ids });
      if (error || epoch !== generation) return;
      const { data: { session } } = await db.auth.getSession();
      if (session?.user.id !== customerId || epoch !== generation) return;
      for (const state of data as LiveState[]) {
        if (epoch !== generation) return;
        await display(state, session.access_token);
      }
    } catch { /* Reconcile on resume or next refresh. Checkout remains independent. */ }
    finally {
      busy = false;
      if (queued) { queued = false; void refresh(); }
    }
  };
  void refresh();
  const channel = db.channel('customer-order-live-' + customerId).on('postgres_changes', {
    event: '*', schema: 'public', table: 'orders', filter: 'customer_id=eq.' + customerId,
  }, refresh).subscribe();
  const timer = window.setInterval(refresh, 10000);
  document.addEventListener('visibilitychange', refresh);
  return () => {
    if (generation === epoch) ++generation;
    window.clearInterval(timer);
    document.removeEventListener('visibilitychange', refresh);
    void db.removeChannel(channel);
  };
}

export async function clearCustomerLive() {
  if (!Capacitor.isNativePlatform()) return;
  ++generation;
  ++accountGeneration;
  registered.clear();
  await native.clear().catch(() => {});
  await getSupabase().rpc('unregister_order_live', { p_installation: installation() });
}

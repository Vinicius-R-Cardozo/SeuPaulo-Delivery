import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import { getSupabase } from './supabase/client';
import { uuid } from '@/utils/id';

interface PushState { platform: 'android' | 'ios' | 'ios-sandbox'; token?: string; route?: string }
const native = registerPlugin<{
  state(): Promise<PushState>;
  enable(options: { enabled: boolean }): Promise<void>;
  clear(): Promise<void>;
  addListener(name: 'pushChanged', handler: () => void): Promise<PluginListenerHandle>;
}>('AppPush');

let authGeneration = 0;
let writes: Promise<unknown> = Promise.resolve();

function installation() {
  const key = 'app-push-installation';
  const id = localStorage.getItem(key) ?? uuid();
  localStorage.setItem(key, id);
  return id;
}

function allowedRoute(route: string) {
  const id = '[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}';
  return route === '/entregador' || route === '/entregador/historico' ||
    new RegExp('^/(?:app/pedido|entregador/entrega)/' + id + '$', 'i').test(route);
}

export function followAppPush(userId: string, open: (path: string) => void) {
  if (!Capacitor.isNativePlatform()) return () => {};
  const db = getSupabase();
  const generation = ++authGeneration;
  const current = () => generation === authGeneration;
  let applied: string | undefined;
  let running = false;
  let again = false;
  const sync = async () => {
    if (!current() || document.hidden) return;
    if (running) { again = true; return; }
    running = true;
    try {
      const state = await native.state();
      if (!state || !current()) return;
      const { data: { session } } = await db.auth.getSession();
      if (!current() || session?.user.id !== userId) return;
      if (state.route && allowedRoute(state.route)) open(state.route);
      const key = state.token ? state.platform + ':' + state.token : '';
      if (key === applied) return;
      writes = writes.catch(() => {}).then(async () => {
        if (!current()) return;
        const { error } = state.token
          ? await db.rpc('register_app_push', { p_installation: installation(), p_platform: state.platform, p_token: state.token })
          : await db.rpc('unregister_app_push', { p_installation: installation() });
        if (!error && current()) {
          await native.enable({ enabled: Boolean(state.token) });
          applied = key;
        }
      });
      await writes;
    } catch { /* registration recovers on resume or next sync */ }
    finally {
      running = false;
      if (again) { again = false; void sync(); }
    }
  };
  const listener = native.addListener('pushChanged', sync).catch(() => null);
  document.addEventListener('visibilitychange', sync);
  const timer = window.setInterval(sync, 30000);
  void sync();
  return () => {
    if (current()) ++authGeneration;
    window.clearInterval(timer);
    document.removeEventListener('visibilitychange', sync);
    void listener.then(handle => handle?.remove());
  };
}

export async function clearAppPush() {
  if (!Capacitor.isNativePlatform()) return;
  ++authGeneration;
  await native.clear().catch(() => {});
  await writes.catch(() => {});
  await getSupabase().rpc('unregister_app_push', { p_installation: installation() });
}

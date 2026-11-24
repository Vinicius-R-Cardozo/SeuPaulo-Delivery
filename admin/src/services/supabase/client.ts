import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL?.trim();
const publicKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() ||
  import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

export const isSupabaseConfigured = Boolean(url && publicKey);
export function kitchenPairingCode(code: string): string {
  if (!url || !publicKey) throw new Error('Configuração pública do projeto indisponível.');
  return btoa(JSON.stringify({ url, key: publicKey, code }));
}

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!url || !publicKey) {
    throw new Error(
      'Supabase não configurado. Defina VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY no .env.local.',
    );
  }
  if (!client) {
    client = createClient(url, publicKey, {
      auth: { persistSession: true, autoRefreshToken: true },
    });
  }
  return client;
}

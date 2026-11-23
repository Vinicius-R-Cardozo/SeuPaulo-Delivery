import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim().replace(/\/+$/, '');
export const publicKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() ||
  import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

export const isSupabaseConfigured = Boolean(supabaseUrl && publicKey);

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!supabaseUrl || !publicKey) {
    throw new Error(
      'Supabase não configurado. Defina VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY no .env.',
    );
  }
  if (!client) {
    client = createClient(supabaseUrl, publicKey, {
      auth: { persistSession: true, autoRefreshToken: true },
    });
  }
  return client;
}

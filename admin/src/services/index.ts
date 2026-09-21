import type { DataRepository } from './types';
import { getSupabaseRepository } from './supabase/supabaseRepository';
import { isSupabaseConfigured } from './supabase/client';

/**
 * O painel administrativo usa exclusivamente o Supabase (mesmo backend do app).
 * Configure VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY (ver .env.example).
 */
export const repository: DataRepository = getSupabaseRepository();
export const usingSupabase = true;
export const supabaseReady = isSupabaseConfigured;

export type { DataRepository } from './types';

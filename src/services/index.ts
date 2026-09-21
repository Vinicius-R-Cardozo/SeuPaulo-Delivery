import type { DataRepository } from './types';
import { mockRepository } from './mock/mockRepository';
import { isSupabaseConfigured } from './supabase/client';
import { getSupabaseRepository } from './supabase/supabaseRepository';
import { HttpRepository } from './http/httpRepository';

/**
 * Seleção do backend em tempo de execução (nesta ordem):
 * 1. VITE_API_URL definido  → backend HTTP FastAPI (produção/local via ngrok)
 * 2. VITE_USE_SUPABASE=true + credenciais → Supabase
 * 3. caso contrário         → backend mock local (funciona sem chaves)
 */
const apiUrl = (import.meta.env.VITE_API_URL as string | undefined)?.trim();
const useSupabase =
  (import.meta.env.VITE_USE_SUPABASE as string | undefined) === 'true' && isSupabaseConfigured;

function pickRepository(): { repo: DataRepository; name: string } {
  if (apiUrl) return { repo: new HttpRepository(apiUrl), name: 'http' };
  if (useSupabase) return { repo: getSupabaseRepository(), name: 'supabase' };
  return { repo: mockRepository, name: 'mock' };
}

const selected = pickRepository();

export const repository: DataRepository = selected.repo;
export const backendKind = selected.name;
/** Mantido por compatibilidade com telas que checam o modo Supabase. */
export const usingSupabase = selected.name === 'supabase';

export type { DataRepository } from './types';

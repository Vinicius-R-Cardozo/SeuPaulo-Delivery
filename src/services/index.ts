import type { DataRepository } from './types';
import { mockRepository } from './mock/mockRepository';
import { isSupabaseConfigured } from './supabase/client';
import { getSupabaseRepository } from './supabase/supabaseRepository';

/**
 * Seleção do backend em tempo de execução:
 * - VITE_USE_SUPABASE=true + credenciais válidas → Supabase (produção)
 * - caso contrário → backend mock local (demonstração), que funciona sem chaves.
 */
const useSupabase =
  (import.meta.env.VITE_USE_SUPABASE as string | undefined) === 'true' && isSupabaseConfigured;

export const repository: DataRepository = useSupabase
  ? getSupabaseRepository()
  : mockRepository;

export const usingSupabase = useSupabase;

export type { DataRepository } from './types';

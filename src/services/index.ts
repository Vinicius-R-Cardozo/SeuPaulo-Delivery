import { getSupabaseRepository } from './supabase/supabaseRepository';

export const repository = getSupabaseRepository();

export type { DataRepository } from './types';

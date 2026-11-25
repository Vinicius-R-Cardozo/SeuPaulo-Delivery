import { getSupabase } from './supabase/client';

const recoveryPage = import.meta.env.VITE_DELIVERY_PASSWORD_RESET_URL?.trim() ||
  'https://www.seupaulobuteco.com.br/delivery/redefinir-senha';

export type RecoveryRole = 'customer' | 'driver';

export const recoveryPaths = {
  customer: { request: '/recuperar-senha', login: '/login' },
  driver: { request: '/entregador/recuperar-senha', login: '/entregador/login' },
} as const;

export async function requestPasswordRecovery(email: string) {
  const { error } = await getSupabase().auth.resetPasswordForEmail(email.trim(), { redirectTo: recoveryPage });
  if (error?.status === 429) throw new Error('Aguarde alguns minutos antes de pedir outro link.');
  if (error) throw new Error('Não foi possível enviar o link agora. Tente novamente.');
}

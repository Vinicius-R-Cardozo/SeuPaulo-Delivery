/** Geradores de identificadores. */

/** UUID puro (sem prefixo) — use para colunas do tipo uuid no Supabase. */
export function uuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  // Fallback RFC4122-ish para ambientes sem crypto.randomUUID.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function uid(prefix = ''): string {
  const rand = uuid();
  return prefix ? `${prefix}_${rand}` : rand;
}

/** Código curto legível para o pedido, ex.: #7F3A. */
export function orderCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 4; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return `#${out}`;
}

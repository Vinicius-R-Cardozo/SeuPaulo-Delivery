import type { OrderStatus, DriverStatus, PaymentStatus } from '@/types';

export interface StatusMeta {
  label: string;
  emoji: string;
  /** classes tailwind para o badge (texto + fundo) */
  className: string;
  /** posição na timeline (cancelled fica fora) */
  step: number;
}

export const ORDER_STATUS_META: Record<OrderStatus, StatusMeta> = {
  received: {
    label: 'Pedido recebido',
    emoji: '🟡',
    className: 'text-amber bg-amber/10',
    step: 0,
  },
  confirmed: {
    label: 'Pedido confirmado',
    emoji: '🟠',
    className: 'text-amber-2 bg-amber/10',
    step: 1,
  },
  preparing: {
    label: 'Em preparo',
    emoji: '👨‍🍳',
    className: 'text-info bg-info/10',
    step: 2,
  },
  ready: {
    label: 'Pronto para entrega',
    emoji: '📦',
    className: 'text-info bg-info/10',
    step: 3,
  },
  on_the_way: {
    label: 'Saiu para entrega',
    emoji: '🛵',
    className: 'text-brand-2 bg-brand/10',
    step: 4,
  },
  arrived: {
    label: 'Entregador chegou',
    emoji: '🛎️',
    className: 'text-brand-2 bg-brand/10',
    step: 5,
  },
  delivered: {
    label: 'Entregue',
    emoji: '🟢',
    className: 'text-success bg-success/10',
    step: 6,
  },
  cancelled: {
    label: 'Cancelado',
    emoji: '⚫',
    className: 'text-cream-3 bg-ink-4/40',
    step: -1,
  },
};

/** Ordem canônica da timeline de entrega (sem cancelamento). */
export const ORDER_FLOW: OrderStatus[] = [
  'received',
  'confirmed',
  'preparing',
  'ready',
  'on_the_way',
  'arrived',
  'delivered',
];

/** Esteira do ADMIN: avança até "saiu para entrega". As etapas seguintes
 * (chegou / entregue) são do entregador — entregue só via código do cliente. */
const ADMIN_FLOW: OrderStatus[] = ['received', 'confirmed', 'preparing', 'ready', 'on_the_way'];

export function nextStatus(status: OrderStatus): OrderStatus | null {
  const i = ADMIN_FLOW.indexOf(status);
  if (i < 0 || i >= ADMIN_FLOW.length - 1) return null;
  return ADMIN_FLOW[i + 1];
}

export const DRIVER_STATUS_META: Record<DriverStatus, StatusMeta> = {
  pending: { label: 'Em análise', emoji: '🟡', className: 'text-amber bg-amber/10', step: 0 },
  approved: { label: 'Aprovado', emoji: '🟢', className: 'text-success bg-success/10', step: 1 },
  rejected: { label: 'Reprovado', emoji: '🔴', className: 'text-danger bg-danger/10', step: 2 },
  blocked: { label: 'Bloqueado', emoji: '🚫', className: 'text-danger bg-danger/10', step: 3 },
};

export const PAYMENT_STATUS_META: Record<PaymentStatus, StatusMeta> = {
  pending: { label: 'Pagamento pendente', emoji: '⏳', className: 'text-amber bg-amber/10', step: 0 },
  approved: { label: 'Pago', emoji: '✅', className: 'text-success bg-success/10', step: 1 },
  failed: { label: 'Falhou', emoji: '❌', className: 'text-danger bg-danger/10', step: 2 },
  refunded: { label: 'Estornado', emoji: '↩️', className: 'text-info bg-info/10', step: 3 },
};

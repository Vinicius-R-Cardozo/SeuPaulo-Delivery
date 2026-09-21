import type { OrderStatus, DriverStatus, PaymentStatus } from '@/types';
import {
  ORDER_STATUS_META,
  DRIVER_STATUS_META,
  PAYMENT_STATUS_META,
} from '@/utils/status';
import { cn } from '@/utils/cn';

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const m = ORDER_STATUS_META[status];
  return (
    <span className={cn('badge', m.className)}>
      <span aria-hidden>{m.emoji}</span>
      {m.label}
    </span>
  );
}

export function DriverStatusBadge({ status }: { status: DriverStatus }) {
  const m = DRIVER_STATUS_META[status];
  return (
    <span className={cn('badge', m.className)}>
      <span aria-hidden>{m.emoji}</span>
      {m.label}
    </span>
  );
}

export function PaymentStatusBadge({ status }: { status: PaymentStatus }) {
  const m = PAYMENT_STATUS_META[status];
  return (
    <span className={cn('badge', m.className)}>
      <span aria-hidden>{m.emoji}</span>
      {m.label}
    </span>
  );
}

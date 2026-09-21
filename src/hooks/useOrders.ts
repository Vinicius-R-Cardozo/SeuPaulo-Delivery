import { useEffect, useState } from 'react';
import type { Order } from '@/types';
import { repository } from '@/services';

/** Assina um pedido específico em tempo real. */
export function useOrder(orderId: string | undefined) {
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!orderId) return;
    setLoading(true);
    const unsub = repository.subscribeOrder(orderId, (o) => {
      setOrder(o);
      setLoading(false);
    });
    return unsub;
  }, [orderId]);

  return { order, loading };
}

/** Assina todos os pedidos (admin). */
export function useAllOrders() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = repository.subscribeOrders((list) => {
      setOrders(list);
      setLoading(false);
    });
    return unsub;
  }, []);

  return { orders, loading };
}

/** Assina os pedidos de um cliente. */
export function useCustomerOrders(customerId: string | undefined) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!customerId) return;
    const unsub = repository.subscribeOrders((list) => {
      setOrders(list.filter((o) => o.customerId === customerId));
      setLoading(false);
    });
    return unsub;
  }, [customerId]);

  return { orders, loading };
}

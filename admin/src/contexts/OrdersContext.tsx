import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { Order } from '@/types';
import { repository } from '@/services';
import { useToast } from '@/providers/ToastProvider';
import { playNewOrderChime, primeAudio } from '@/utils/sound';

interface OrdersFeed {
  orders: Order[];
  loading: boolean;
}

const OrdersContext = createContext<OrdersFeed | null>(null);
const POLL_MS = 4000;
const BASE_TITLE = 'Seu Paulo · Admin';

/**
 * Alimenta o painel com os pedidos EM TEMPO REAL (polling a cada 4s) — sem
 * precisar recarregar a página. Ao detectar um novo pedido, toca um alerta
 * sonoro e mostra um aviso. Fica montado enquanto o admin está logado.
 */
export function OrdersProvider({ children }: { children: ReactNode }) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const knownIds = useRef<Set<string> | null>(null);
  const toast = useToast();
  const toastRef = useRef(toast);
  toastRef.current = toast;

  useEffect(() => {
    // Libera o áudio no primeiro clique do usuário (política de autoplay).
    const onGesture = () => primeAudio();
    window.addEventListener('pointerdown', onGesture, { once: true });

    let active = true;
    const load = async () => {
      try {
        const list = await repository.getAllOrders();
        if (!active) return;
        setOrders(list);
        setLoading(false);

        const ids = new Set(list.map((o) => o.id));
        if (knownIds.current === null) {
          knownIds.current = ids; // primeira carga não alerta
        } else {
          const novos = list.filter((o) => !knownIds.current!.has(o.id));
          knownIds.current = ids;
          if (novos.length > 0) {
            playNewOrderChime();
            const first = novos[0];
            toastRef.current.info(
              `🔔 Novo pedido ${first.code}${novos.length > 1 ? ` e mais ${novos.length - 1}` : ''}!`,
            );
            document.title = `(${novos.length}) 🔔 Novo pedido! · ${BASE_TITLE}`;
            window.setTimeout(() => {
              document.title = BASE_TITLE;
            }, 8000);
          }
        }
      } catch {
        /* silencioso — tenta de novo no próximo ciclo */
      }
    };

    void load();
    const timer = window.setInterval(load, POLL_MS);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener('pointerdown', onGesture);
    };
  }, []);

  return <OrdersContext.Provider value={{ orders, loading }}>{children}</OrdersContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useOrdersFeed(): OrdersFeed {
  const ctx = useContext(OrdersContext);
  if (!ctx) throw new Error('useOrdersFeed deve ser usado dentro de OrdersProvider.');
  return ctx;
}

import { useEffect, useState } from 'react';
import { getSupabase, isSupabaseConfigured } from '@/services/supabase/client';

type KitchenAlert = { order_id: string; code: string; kind: 'delayed' | 'review' };

export function useKitchenOrderAlerts() {
  const [alerts, setAlerts] = useState<KitchenAlert[]>([]);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    const controller = new AbortController();
    let timer: number;
    const refresh = async () => {
      try {
        const { data, error } = await getSupabase().rpc('kitchen_order_alerts').abortSignal(controller.signal);
        if (error) throw error;
        if (!controller.signal.aborted) {
          setAlerts(data ?? []);
          setUnavailable(false);
        }
      } catch {
        if (!controller.signal.aborted) setUnavailable(true);
      } finally {
        if (!controller.signal.aborted) timer = window.setTimeout(refresh, 4000);
      }
    };
    void refresh();
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, []);
  return { alerts, unavailable };
}

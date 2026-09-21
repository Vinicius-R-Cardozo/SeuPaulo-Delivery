import { useCallback, useEffect, useState } from 'react';
import type { Driver } from '@/types';
import { repository } from '@/services';
import { useAuth } from '@/contexts/AuthContext';

/** Carrega e mantém o registro do entregador logado. */
export function useDriver() {
  const { profile } = useAuth();
  const [driver, setDriver] = useState<Driver | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!profile) return;
    const d = await repository.getDriver(profile.id);
    setDriver(d);
    setLoading(false);
  }, [profile]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { driver, loading, refresh, setDriver };
}

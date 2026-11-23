import { useEffect, useState } from 'react';
import type { Driver } from '@/types';
import { repository } from '@/services';
import { useAuth } from '@/contexts/AuthContext';

export function useDriver() {
  const { profile } = useAuth();
  const driverId = profile?.id;
  const [record, setRecord] = useState<{ id: string; driver: Driver | null } | null>(null);

  useEffect(() => {
    if (!driverId) return;
    return repository.subscribeDriver(driverId, driver => setRecord({ id: driverId, driver }));
  }, [driverId]);

  return {
    driver: record && record.id === driverId ? record.driver : null,
    loading: Boolean(driverId && record?.id !== driverId),
    setDriver: (driver: Driver) => setRecord({ id: driver.id, driver }),
  };
}

import { useEffect, useState } from 'react';
import type { Product } from '@/types';

const barDay = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Sao_Paulo',
  weekday: 'short',
});
const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function currentWeekday() {
  return weekdays.indexOf(barDay.format(new Date()));
}

export function useMenuWeekday() {
  const [weekday, setWeekday] = useState(currentWeekday);
  useEffect(() => {
    const refresh = () => setWeekday(currentWeekday());
    const interval = window.setInterval(refresh, 60_000);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, []);
  return weekday;
}

export function isProductAvailableToday(product: Product, weekday = currentWeekday()) {
  return product.available && (product.availableWeekdays?.includes(weekday) ?? true);
}

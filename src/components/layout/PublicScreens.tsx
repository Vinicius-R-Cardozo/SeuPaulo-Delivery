import { Outlet } from 'react-router-dom';
import { useScreenEntry } from '@/hooks/useScreenEntry';

export function PublicScreens() {
  const screen = useScreenEntry<HTMLDivElement>('slide');

  return (
    <div ref={screen}>
      <Outlet />
    </div>
  );
}

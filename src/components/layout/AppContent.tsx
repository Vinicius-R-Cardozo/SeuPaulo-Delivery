import { useLayoutEffect, useState, type ReactNode } from 'react';
import { useLocation, useOutlet } from 'react-router-dom';
import { useScreenEntry } from '@/hooks/useScreenEntry';

interface Page {
  index: number;
  outlet: ReactNode;
}

export function AppContent({ tabIndex }: { tabIndex: number }) {
  const { key } = useLocation();
  const outlet = useOutlet();
  const [current, setCurrent] = useState<Page>({ index: tabIndex, outlet });
  const [departing, setDeparting] = useState<Page | null>(null);
  const scrollArea = useScreenEntry<HTMLElement>(departing ? 'none' : 'fade');

  if (current.index !== tabIndex) {
    const slide = current.index >= 0 && tabIndex >= 0 &&
      !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    setDeparting(slide ? current : null);
    setCurrent({ index: tabIndex, outlet });
  }

  useLayoutEffect(() => {
    scrollArea.current?.scrollTo({ top: 0, behavior: 'instant' });
  }, [key]);

  return (
    <div className="app-page-viewport" data-direction={departing && (tabIndex > departing.index ? 'forward' : 'backward')}>
      {departing && (
        <main key={departing.index} aria-hidden="true" inert className="app-content app-page-exit">
          {departing.outlet}
        </main>
      )}
      <main
        key={tabIndex}
        ref={scrollArea}
        className={departing ? 'app-content app-page-enter' : 'app-content'}
        onAnimationEnd={(event) => {
          if (event.target === event.currentTarget) setDeparting(null);
        }}
      >
        {outlet}
      </main>
    </div>
  );
}

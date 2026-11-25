import { useLayoutEffect, useRef } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';

type EntryMotion = 'fade' | 'slide' | 'none';

export function useScreenEntry<T extends HTMLElement>(motion: EntryMotion) {
  const { pathname } = useLocation();
  const navigationType = useNavigationType();
  const screen = useRef<T>(null);
  const previousPath = useRef<string | null>(null);
  const animation = useRef<Animation | null>(null);

  useLayoutEffect(() => {
    if (previousPath.current === pathname) return;
    const initialPage = previousPath.current === null && navigationType === 'POP';
    previousPath.current = pathname;
    animation.current?.cancel();
    animation.current = null;

    const element = screen.current;
    if (
      initialPage || motion === 'none' || !element?.animate ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) return;

    const keyframes = motion === 'slide'
      ? [{ opacity: 0.56, transform: 'translateY(10px)' }, { opacity: 1, transform: 'none' }]
      : [{ opacity: 0.52 }, { opacity: 1 }];
    animation.current = element.animate(keyframes, {
      duration: 220,
      easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
    });
  }, [motion, navigationType, pathname]);

  return screen;
}

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Capacitor, registerPlugin } from '@capacitor/core';
import leftGlass from '@/assets/launch/left-glass.png';
import rightGlass from '@/assets/launch/right-glass.png';
import toastRays from '@/assets/launch/toast-rays.png';
import './native-launch.css';

const launchSplash = registerPlugin<{
  ready: () => Promise<void>;
  finish: () => Promise<void>;
}>('LaunchSplash');
type LaunchPhase = 'waiting' | 'playing' | 'leaving' | 'done';

export function NativeLaunch({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  const [phase, setPhase] = useState<LaunchPhase>(() => {
    if (!enabled) return 'done';
    return Capacitor.isPluginAvailable('LaunchSplash') ? 'waiting' : 'playing';
  });
  const androidExit = useRef<Promise<void> | null>(null);
  const isAndroid = Capacitor.getPlatform() === 'android';
  const visible = phase !== 'done';

  useLayoutEffect(() => {
    document.documentElement.classList.remove('native-launching');
  }, []);

  useLayoutEffect(() => {
    if (enabled && isAndroid && !visible && Capacitor.isPluginAvailable('LaunchSplash')) {
      void launchSplash.finish().catch(() => {});
    }
  }, [enabled, isAndroid, visible]);

  useEffect(() => {
    if (phase !== 'waiting') return;
    let active = true;
    let frame = 0;
    const play = () => setPhase('playing');
    const onExit = () => {
      if (active) frame = window.requestAnimationFrame(play);
    };
    const timeout = window.setTimeout(play, 2_500);
    androidExit.current ??= launchSplash.ready();
    void androidExit.current.then(onExit, onExit);
    return () => {
      active = false;
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timeout);
    };
  }, [phase]);

  useEffect(() => {
    if (phase !== 'playing' && phase !== 'leaving') return;

    // Release the UI if the WebView skips the animation end event.
    const timeout = phase === 'playing'
      ? window.setTimeout(() => setPhase('leaving'), 1_700)
      : window.setTimeout(() => setPhase('done'), 750);
    return () => window.clearTimeout(timeout);
  }, [phase]);

  if (!enabled) return children;

  return (
    <>
      <div className="native-launch-content" inert={visible}>{children}</div>
      {visible && (
        <div
          className="native-launch"
          data-phase={phase}
          data-android={isAndroid || undefined}
          role="img"
          aria-label="Seu Paulo Buteco"
          onAnimationEnd={(event) => {
            if (event.target === event.currentTarget && event.animationName === 'launch-exit') {
              setPhase('done');
            }
          }}
        >
          <div className="native-launch__glasses" aria-hidden="true">
            <img className="native-launch__glass native-launch__glass--left" src={leftGlass} alt="" />
            <img className="native-launch__glass native-launch__glass--right" src={rightGlass} alt="" />
            <img className="native-launch__rays" src={toastRays} alt="" />
          </div>
          <img
            className="native-launch__logo"
            src="/logo-light.png"
            alt=""
            onAnimationEnd={(event) => {
              if (event.animationName === 'launch-logo') {
                setPhase((current) => current === 'playing' ? 'leaving' : current);
              }
            }}
          />
        </div>
      )}
    </>
  );
}

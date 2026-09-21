import { useCallback, useState } from 'react';
import type { LatLng } from '@/types';

interface GeolocationState {
  position: LatLng | null;
  loading: boolean;
  error: string | null;
}

/** Acesso à localização atual do dispositivo com tratamento de erro amigável. */
export function useGeolocation() {
  const [state, setState] = useState<GeolocationState>({
    position: null,
    loading: false,
    error: null,
  });

  const request = useCallback((): Promise<LatLng> => {
    return new Promise((resolve, reject) => {
      if (!('geolocation' in navigator)) {
        const msg = 'Geolocalização não suportada neste dispositivo.';
        setState({ position: null, loading: false, error: msg });
        reject(new Error(msg));
        return;
      }
      setState((s) => ({ ...s, loading: true, error: null }));
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const position = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          setState({ position, loading: false, error: null });
          resolve(position);
        },
        (err) => {
          const msg =
            err.code === err.PERMISSION_DENIED
              ? 'Permissão de localização negada. Você pode buscar o endereço manualmente.'
              : 'Não foi possível obter sua localização.';
          setState({ position: null, loading: false, error: msg });
          reject(new Error(msg));
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 },
      );
    });
  }, []);

  return { ...state, request };
}

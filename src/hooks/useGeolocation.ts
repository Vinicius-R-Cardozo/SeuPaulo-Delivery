import { useCallback, useState } from 'react';
import type { LatLng } from '@/types';

interface GeolocationState {
  position: LatLng | null;
  loading: boolean;
  error: string | null;
  permissionDenied: boolean;
}

/** Acesso à localização atual do dispositivo com tratamento de erro amigável. */
export function useGeolocation() {
  const [state, setState] = useState<GeolocationState>({
    position: null,
    loading: false,
    error: null,
    permissionDenied: false,
  });

  const request = useCallback((options?: PositionOptions): Promise<LatLng> => {
    return new Promise((resolve, reject) => {
      if (!('geolocation' in navigator)) {
        const msg = 'Geolocalização não suportada neste dispositivo.';
        setState({ position: null, loading: false, error: msg, permissionDenied: false });
        reject(new Error(msg));
        return;
      }
      setState((s) => ({ ...s, loading: true, error: null, permissionDenied: false }));
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const position = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          setState({ position, loading: false, error: null, permissionDenied: false });
          resolve(position);
        },
        (err) => {
          const permissionDenied = err.code === err.PERMISSION_DENIED;
          const msg = permissionDenied
            ? 'Permissão de localização negada. Você pode buscar o endereço manualmente.'
            : 'Não foi possível obter sua localização.';
          setState({ position: null, loading: false, error: msg, permissionDenied });
          reject(new Error(msg));
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000, ...options },
      );
    });
  }, []);

  return { ...state, request };
}

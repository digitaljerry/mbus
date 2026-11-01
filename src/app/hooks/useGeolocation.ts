'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export type GeoStatus = 'idle' | 'locating' | 'ok' | 'denied' | 'unavailable';

/** Your position while `active`. Asks for permission on first use. */
export function useGeolocation(active: boolean) {
  const [status, setStatus] = useState<GeoStatus>('idle');
  const [position, setPosition] = useState<{ lat: number; lon: number; accuracy: number } | null>(null);
  const watchId = useRef<number | null>(null);

  const stop = useCallback(() => {
    if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current);
    watchId.current = null;
  }, []);

  const start = useCallback(() => {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      setStatus('unavailable');
      return;
    }
    stop();
    setStatus(s => (s === 'ok' ? s : 'locating'));
    watchId.current = navigator.geolocation.watchPosition(
      p => {
        setPosition({ lat: p.coords.latitude, lon: p.coords.longitude, accuracy: p.coords.accuracy });
        setStatus('ok');
      },
      err => setStatus(err.code === err.PERMISSION_DENIED ? 'denied' : 'unavailable'),
      { enableHighAccuracy: true, maximumAge: 20_000, timeout: 20_000 }
    );
  }, [stop]);

  useEffect(() => {
    if (active) start();
    else stop();
    return stop;
  }, [active, start, stop]);

  return { status, position, retry: start };
}

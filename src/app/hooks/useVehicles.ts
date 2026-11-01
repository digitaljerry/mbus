'use client';

import { useCallback, useState } from 'react';
import type { Vehicle } from '../types';
import { usePolling } from './usePolling';

/** Live bus positions for the given lines, refreshed every 10 s while visible. */
export function useVehicles(routes: string[], enabled = true) {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [error, setError] = useState(false);
  const routeParam = [...new Set(routes.map(r => r.toUpperCase()))].sort().join(',');

  const load = useCallback(async () => {
    if (!routeParam) {
      setVehicles([]);
      return;
    }
    try {
      const res = await fetch(`/api/vehicles?routes=${encodeURIComponent(routeParam)}`, { cache: 'no-store' });
      const body = await res.json();
      setVehicles(Array.isArray(body.vehicles) ? body.vehicles : []);
      setError(!res.ok);
    } catch {
      setError(true);
    }
  }, [routeParam]);

  usePolling(load, { intervalMs: 10 * 1000, staleAfterMs: 5 * 1000, enabled, resetKey: routeParam });

  return { vehicles, error };
}

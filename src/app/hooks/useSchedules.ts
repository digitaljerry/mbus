'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import type { BusStop, ScheduleResponse } from '../types';
import { usePolling } from './usePolling';

export const REFRESH_INTERVAL_MS = 30 * 1000;

export const legKey = (stopId: string, route: string) => `${stopId}:${route.toUpperCase()}`;

interface State {
  data: Record<string, ScheduleResponse>;
  errors: Record<string, boolean>;
  lastUpdated: number;
  refreshing: boolean;
}

/** Fetches (and keeps fresh) departures for every stop/route used by the journeys. */
export function useSchedules(journeys: BusStop[]) {
  const [state, setState] = useState<State>({ data: {}, errors: {}, lastUpdated: 0, refreshing: false });
  const inFlight = useRef(false);

  const legs = useMemo(() => {
    const map = new Map<string, { stopId: string; route: string }>();
    journeys.forEach(j => j.stops.forEach(s => {
      if (s.stopId && s.route) map.set(legKey(s.stopId, s.route), { stopId: s.stopId, route: s.route.toUpperCase() });
    }));
    return [...map.entries()];
  }, [journeys]);
  const legsSignature = legs.map(([k]) => k).sort().join('|');

  const refresh = useCallback(async () => {
    if (inFlight.current || legs.length === 0) return;
    inFlight.current = true;
    setState(s => ({ ...s, refreshing: true }));
    const results = await Promise.all(
      legs.map(async ([key, { stopId, route }]) => {
        try {
          const res = await fetch(`/api/schedules?stop=${encodeURIComponent(stopId)}&route=${encodeURIComponent(route)}`, { cache: 'no-store' });
          const body = (await res.json()) as ScheduleResponse;
          return { key, body, ok: res.ok && Array.isArray(body.schedules) };
        } catch {
          return { key, body: undefined, ok: false };
        }
      })
    );
    setState(s => {
      const data = { ...s.data };
      const errors: Record<string, boolean> = {};
      for (const r of results) {
        if (r.ok && r.body) data[r.key] = r.body;
        else errors[r.key] = true;
      }
      return { data, errors, lastUpdated: Date.now(), refreshing: false };
    });
    inFlight.current = false;
    // legsSignature captures the legs content; legs identity alone changes every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [legsSignature]);

  usePolling(refresh, { intervalMs: REFRESH_INTERVAL_MS, staleAfterMs: 15 * 1000, enabled: legs.length > 0, resetKey: legsSignature });

  return { ...state, refresh };
}

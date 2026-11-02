'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { BusStop, ScheduleResponse } from '../types';
import { usePolling } from './usePolling';

export const REFRESH_INTERVAL_MS = 30 * 1000;

export const legKey = (stopId: string, route: string, toStopId?: string) =>
  `${stopId}:${route.toUpperCase()}${toStopId ? `>${toStopId}` : ''}`;

interface State {
  data: Record<string, ScheduleResponse>;
  errors: Record<string, boolean>;
  lastUpdated: number;
  refreshing: boolean;
}

/**
 * Fetches (and keeps fresh) departures for every stop/route used by the
 * journeys. `limits` (by legKey) asks for more than the default 5 upcoming,
 * `befores` for more than the default 3 departures that are already due.
 */
export const DEFAULT_BEFORE = 3;

export function useSchedules(journeys: BusStop[], limits: Record<string, number> = {}, befores: Record<string, number> = {}) {
  const [state, setState] = useState<State>({ data: {}, errors: {}, lastUpdated: 0, refreshing: false });
  const inFlight = useRef(false);
  // A refresh requested while one is running runs right after it.
  const queued = useRef(false);
  const latestRefresh = useRef<() => Promise<void>>(async () => {});

  const legs = useMemo(() => {
    const map = new Map<string, { stopId: string; route: string; toStopId?: string; limit?: number; before: number }>();
    journeys.forEach(j => j.stops.forEach(s => {
      if (!s.stopId || !s.route) return;
      const key = legKey(s.stopId, s.route, s.toStopId);
      map.set(key, { stopId: s.stopId, route: s.route.toUpperCase(), toStopId: s.toStopId, limit: limits[key], before: befores[key] ?? DEFAULT_BEFORE });
    }));
    return [...map.entries()];
  }, [journeys, limits, befores]);
  const legsSignature = legs.map(([k, v]) => `${k}#${v.limit ?? ''}#${v.before}`).sort().join('|');

  const refresh = useCallback(async () => {
    if (legs.length === 0) return;
    if (inFlight.current) {
      queued.current = true;
      return;
    }
    inFlight.current = true;
    setState(s => ({ ...s, refreshing: true }));
    // Each leg updates the board as soon as it arrives.
    const errors: Record<string, boolean> = {};
    await Promise.all(
      legs.map(async ([key, { stopId, route, toStopId, limit, before }]) => {
        let body: ScheduleResponse | undefined;
        try {
          const to = toStopId ? `&to=${encodeURIComponent(toStopId)}` : '';
          const lim = `${limit ? `&limit=${limit}` : ''}&before=${before}`;
          const res = await fetch(`/api/schedules?stop=${encodeURIComponent(stopId)}&route=${encodeURIComponent(route)}${to}${lim}`, { cache: 'no-store' });
          const json = (await res.json()) as ScheduleResponse;
          if (res.ok && Array.isArray(json.schedules)) body = json;
        } catch {}
        if (body) {
          const ok = body;
          setState(s => ({ ...s, data: { ...s.data, [key]: ok } }));
        } else {
          errors[key] = true;
        }
      })
    );
    setState(s => ({ ...s, errors, lastUpdated: Date.now(), refreshing: false }));
    inFlight.current = false;
    if (queued.current) {
      queued.current = false;
      void latestRefresh.current();
    }
    // legsSignature captures the legs content; legs identity alone changes every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [legsSignature]);

  useEffect(() => {
    latestRefresh.current = refresh;
  }, [refresh]);

  usePolling(refresh, { intervalMs: REFRESH_INTERVAL_MS, staleAfterMs: 15 * 1000, enabled: legs.length > 0, resetKey: legsSignature });

  return { ...state, refresh };
}

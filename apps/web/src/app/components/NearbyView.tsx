'use client';

import { useCallback, useState } from 'react';
import { Footprints, LocateFixed, MapPin, Navigation, Plus } from 'lucide-react';
import type { Schedule } from '../types';
import { countdown, dayLabel } from '../lib/format';
import { usePolling } from '../hooks/usePolling';
import type { GeoStatus } from '../hooks/useGeolocation';
import RouteBadge from './RouteBadge';
import type { Departure } from './JourneyCard';

export interface NearbyStop {
  stop: string;
  stopName: string;
  lat: number;
  lon: number;
  distance: number;
  walkMinutes: number;
  departures: Array<Schedule & { route: string; routeColor: string }>;
}

interface Props {
  status: GeoStatus;
  position: { lat: number; lon: number; accuracy: number } | null;
  now: number;
  onRetry: () => void;
  onStops: (stops: NearbyStop[]) => void;
  onOpen: (d: Departure, title: string) => void;
  onShowStop: (stopId: string) => void;
  onSaveJourney: (stop: NearbyStop) => void;
}

export default function NearbyView({ status, position, now, onRetry, onStops, onOpen, onShowStop, onSaveJourney }: Props) {
  const [stops, setStops] = useState<NearbyStop[] | null>(null);
  const [error, setError] = useState(false);
  // Re-query when you move ~100 m.
  const cell = position ? `${position.lat.toFixed(3)},${position.lon.toFixed(3)}` : '';

  const load = useCallback(async () => {
    if (!position) return;
    try {
      const res = await fetch(`/api/nearby?lat=${position.lat}&lon=${position.lon}`, { cache: 'no-store' });
      const body = await res.json();
      const list: NearbyStop[] = Array.isArray(body.stops) ? body.stops : [];
      setStops(list);
      onStops(list);
      setError(!res.ok);
    } catch {
      setError(true);
    }
    // position is captured via `cell`; refetching on every GPS jitter would be wasteful.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cell, onStops]);

  usePolling(load, { intervalMs: 30_000, staleAfterMs: 15_000, enabled: Boolean(position), resetKey: cell });

  if (status === 'denied' || status === 'unavailable') {
    return (
      <div className="rounded-2xl border border-line bg-surface p-8 text-center shadow-card">
        <MapPin className="mx-auto size-8 text-ink-3" aria-hidden />
        <p className="mt-3 font-semibold">{status === 'denied' ? 'Location is turned off for MBus' : "Couldn't get your location"}</p>
        <p className="mt-1 text-sm text-ink-3">
          {status === 'denied'
            ? 'Allow location access for this site in your browser or phone settings, then try again.'
            : 'Check that location services are on and try again.'}
        </p>
        <button onClick={onRetry} className="mt-5 rounded-xl bg-accent px-5 py-3 font-semibold text-accent-ink">
          Try again
        </button>
      </div>
    );
  }

  if (!position || stops === null) {
    return (
      <div className="space-y-4" aria-busy>
        <p className="flex items-center gap-2 text-sm text-ink-3">
          <LocateFixed className="size-4 animate-pulse" aria-hidden /> {position ? 'Finding stops near you…' : 'Finding your location…'}
        </p>
        {[0, 1].map(i => (
          <div key={i} className="h-44 animate-pulse rounded-2xl bg-surface" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-ink-3">
        Stops within walking distance{position.accuracy > 150 ? ` (location accurate to ~${Math.round(position.accuracy)} m)` : ''}.
        {error && ' Some data could not be refreshed.'}
      </p>
      {stops.map(s => {
        // Group by line + direction, show the next two of each.
        const groups = new Map<string, NearbyStop['departures']>();
        s.departures.forEach(d => {
          const k = `${d.route}|${d.destination ?? ''}`;
          if (!groups.has(k)) groups.set(k, []);
          groups.get(k)!.push(d);
        });
        return (
          <article key={s.stop} className="overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
            <header className="flex items-start justify-between gap-3 px-4 pt-4">
              <div className="min-w-0">
                <h2 className="truncate font-semibold">{s.stopName}</h2>
                <p className="mt-0.5 flex items-center gap-1 text-xs text-ink-3 tabular">
                  <Footprints className="size-3.5" aria-hidden /> {s.walkMinutes} min walk · {s.distance} m
                </p>
              </div>
              <div className="flex shrink-0 gap-1">
                <button onClick={() => onShowStop(s.stop)} className="rounded-lg p-2 text-ink-3 hover:bg-surface-2 hover:text-ink" aria-label={`Show ${s.stopName} on map`}>
                  <MapPin className="size-4" />
                </button>
                <a
                  href={`https://www.google.com/maps/dir/?api=1&destination=${s.lat},${s.lon}&travelmode=walking`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-lg p-2 text-ink-3 hover:bg-surface-2 hover:text-ink"
                  aria-label={`Walking directions to ${s.stopName}`}
                >
                  <Navigation className="size-4" />
                </a>
                <button onClick={() => onSaveJourney(s)} className="rounded-lg p-2 text-ink-3 hover:bg-surface-2 hover:text-ink" aria-label={`Save ${s.stopName} as a journey`}>
                  <Plus className="size-4" />
                </button>
              </div>
            </header>
            {groups.size === 0 ? (
              <p className="px-4 py-4 text-sm text-ink-3">No departures soon.</p>
            ) : (
              <ul className="mt-2 divide-y divide-line px-2 pb-2">
                {[...groups.values()].map(list => {
                  const first = list[0];
                  const c = countdown(first.epoch, now);
                  const tooFar = first.epoch - s.walkMinutes * 60_000 < now;
                  const day = now ? dayLabel(first.epoch, now) : undefined;
                  const toDeparture = (sch: Schedule): Departure => ({
                    schedule: sch,
                    route: first.route,
                    color: first.routeColor,
                    stopId: s.stop,
                    stopName: s.stopName,
                    source: sch.realtime ? 'brezavta' : 'marprom',
                  });
                  return (
                    <li key={`${first.route}|${first.destination}`}>
                      <button onClick={() => onOpen(toDeparture(first), s.stopName)} className="flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left hover:bg-surface-2">
                        <RouteBadge route={first.route} color={first.routeColor} size="sm" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm">{first.destination}</p>
                          <p className="truncate text-xs text-ink-3 tabular">
                            {day ? `${day} · ` : ''}
                            {list.map(x => x.time).join(' · ')}
                            {first.realtime && <span className="ml-1 text-live">live</span>}
                          </p>
                        </div>
                        <span className={`shrink-0 text-right text-sm font-semibold tabular ${c.urgent ? 'text-accent' : ''} ${tooFar ? 'opacity-50' : ''}`}>
                          {now ? (c.unit ? `${c.value} ${c.unit}` : c.value) : '—'}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </article>
        );
      })}
    </div>
  );
}

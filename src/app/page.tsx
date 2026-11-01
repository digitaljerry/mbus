'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Bus, LayoutList, Map as MapIcon, RefreshCw, Settings2, Sun, WifiOff } from 'lucide-react';
import type { BusStop, Vehicle } from './types';
import { loadPinnedStops, savePinnedStops } from './utils/storage';
import { DEFAULT_STOPS, splitJourneyName } from './lib/defaults';
import { ago, SECONDS_THRESHOLD_MS } from './lib/format';
import { routeColor } from './lib/routeColors';
import { useNow } from './hooks/useNow';
import { legKey, useSchedules } from './hooks/useSchedules';
import { useVehicles } from './hooks/useVehicles';
import { useWakeLock } from './hooks/useWakeLock';
import BusStopManager from './components/BusStopManager';
import JourneyCard, { mergeDepartures, type Departure } from './components/JourneyCard';
import DepartureSheet, { departureKey } from './components/DepartureSheet';
import type { MapFocus, MapStop } from './components/LiveMap';

const LiveMap = dynamic(() => import('./components/LiveMap'), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse bg-surface-2" />,
});

const SELECTED_KEY = 'mbus-selected-journey';
const MIGRATION_KEY = 'mbus-journeys-v2';
const KEEP_AWAKE_KEY = 'mbus-keep-awake';

// One-time: give existing users the Home → School / Home → Office shortcuts.
function addNewDefaultJourneysOnce(stops: BusStop[]): BusStop[] {
  try {
    if (localStorage.getItem(MIGRATION_KEY)) return stops;
    localStorage.setItem(MIGRATION_KEY, '1');
  } catch {
    return stops;
  }
  const additions = DEFAULT_STOPS.filter(d => ['home-to-school', 'home-to-office'].includes(d.id) && !stops.some(s => s.id === d.id));
  if (!additions.length) return stops;
  const anchor = stops.findIndex(s => s.id === 'home-to-city');
  const next = [...stops];
  next.splice(anchor === -1 ? next.length : anchor + 1, 0, ...additions);
  savePinnedStops(next);
  return next;
}
const ALL = 'all';

export default function Home() {
  const [journeys, setJourneys] = useState<BusStop[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [selected, setSelected] = useState<string>(ALL);
  const [managerOpen, setManagerOpen] = useState(false);
  const [mobileView, setMobileView] = useState<'board' | 'map'>('board');
  const [focus, setFocus] = useState<MapFocus>();
  const [online, setOnline] = useState(true);
  const [tracked, setTracked] = useState<{ key: string; journeyId: string; last: Departure } | null>(null);
  const [keepAwake, setKeepAwake] = useState(true);
  const now = useNow(1000);

  // Load journeys + selection (URL ?j= wins, so home-screen shortcuts work).
  useEffect(() => {
    let stops = loadPinnedStops();
    if (stops.length === 0) {
      stops = DEFAULT_STOPS;
      savePinnedStops(stops);
    } else {
      stops = addNewDefaultJourneysOnce(stops);
    }
    setJourneys(stops);
    const fromUrl = new URLSearchParams(window.location.search).get('j');
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(SELECTED_KEY);
    } catch {}
    const want = fromUrl ?? stored ?? ALL;
    setSelected(want === ALL || stops.some(s => s.id === want) ? want : ALL);
    try {
      setKeepAwake(localStorage.getItem(KEEP_AWAKE_KEY) !== 'off');
    } catch {}
    setLoaded(true);

    const updateOnline = () => setOnline(navigator.onLine);
    updateOnline();
    window.addEventListener('online', updateOnline);
    window.addEventListener('offline', updateOnline);
    return () => {
      window.removeEventListener('online', updateOnline);
      window.removeEventListener('offline', updateOnline);
    };
  }, []);

  const select = useCallback((id: string) => {
    setSelected(id);
    try {
      localStorage.setItem(SELECTED_KEY, id);
    } catch {}
    const url = new URL(window.location.href);
    if (id === ALL) url.searchParams.delete('j');
    else url.searchParams.set('j', id);
    window.history.replaceState(null, '', url);
  }, []);

  const updateJourneys = useCallback(
    (next: BusStop[]) => {
      setJourneys(next);
      savePinnedStops(next);
      if (selected !== ALL && !next.some(j => j.id === selected)) select(ALL);
    },
    [selected, select]
  );

  const visible = useMemo(
    () => (selected === ALL ? journeys : journeys.filter(j => j.id === selected)),
    [journeys, selected]
  );

  const { data, errors, lastUpdated, refreshing, refresh } = useSchedules(journeys);

  const visibleRoutes = useMemo(() => [...new Set(visible.flatMap(j => j.stops.map(s => s.route.toUpperCase())))], [visible]);
  const { vehicles } = useVehicles(visibleRoutes, loaded);

  const vehiclesByTrip = useMemo(() => {
    const m = new Map<string, Vehicle>();
    vehicles.forEach(v => v.tripId && m.set(v.tripId, v));
    return m;
  }, [vehicles]);

  const mapStops = useMemo<MapStop[]>(() => {
    const m = new Map<string, MapStop>();
    visible.forEach(j =>
      j.stops.forEach(s => {
        const resp = data[legKey(s.stopId, s.route)];
        if (resp?.lat && resp.lon && !m.has(s.stopId)) {
          m.set(s.stopId, { id: s.stopId, name: resp.stopName ?? `Stop ${s.stopId}`, lat: resp.lat, lon: resp.lon, color: resp.routeColor ?? routeColor(s.route) });
        }
      })
    );
    return [...m.values()];
  }, [visible, data]);

  const showOnMap = useCallback((target: { vehicle?: Vehicle; stopId?: string }) => {
    setFocus({ vehicleId: target.vehicle?.id, stopId: target.stopId, nonce: Date.now() });
    setMobileView('map');
  }, []);

  // Departures per visible journey, recomputed every tick.
  const departuresByJourney = useMemo(
    () => new Map(visible.map(j => [j.id, mergeDepartures(j, data, now)])),
    [visible, data, now]
  );

  // The tracked departure, refreshed from the latest data (delays move it).
  const trackedLive = useMemo(() => {
    if (!tracked) return null;
    const j = journeys.find(x => x.id === tracked.journeyId);
    const fresh = j ? mergeDepartures(j, data, 0).find(d => departureKey(d) === tracked.key) : undefined;
    return { departure: fresh ?? tracked.last, current: Boolean(fresh), journeyName: j?.name };
  }, [tracked, journeys, data]);

  const openDeparture = useCallback(
    (journeyId: string) => (d: Departure) => setTracked({ key: departureKey(d), journeyId, last: d }),
    []
  );

  // Keep the screen on while a bus you're looking at is about to leave.
  const soonest = useMemo(() => {
    const list = trackedLive?.current ? [trackedLive.departure] : [...departuresByJourney.values()].map(l => l[0]).filter(Boolean);
    return Math.min(...list.map(d => d.schedule.epoch), Infinity);
  }, [departuresByJourney, trackedLive]);
  const departingSoon = now > 0 && soonest - now < SECONDS_THRESHOLD_MS && soonest - now > -30_000;
  const wake = useWakeLock(keepAwake && departingSoon);

  const toggleKeepAwake = useCallback(() => {
    setKeepAwake(v => {
      try {
        localStorage.setItem(KEEP_AWAKE_KEY, v ? 'off' : 'on');
      } catch {}
      return !v;
    });
  }, []);

  const hasErrors = Object.keys(errors).length > 0;

  return (
    <div className="flex min-h-dvh flex-col">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-line bg-bg/85 pt-[env(safe-area-inset-top)] backdrop-blur-md">
        <div className="mx-auto flex max-w-[90rem] items-center gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2.5">
            <span className="flex size-9 items-center justify-center rounded-xl bg-accent text-accent-ink shadow-sm">
              <Bus className="size-5" aria-hidden />
            </span>
            <div className="leading-tight">
              <h1 className="text-lg font-bold tracking-tight">MBus</h1>
              <p className="hidden text-xs text-ink-3 sm:block">Maribor departures</p>
            </div>
          </div>

          <div className="ml-auto flex items-center gap-1.5">
            {wake.held && (
              <button
                onClick={toggleKeepAwake}
                className="inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-2.5 py-1.5 text-xs font-medium text-ink-2"
                title="Screen kept on because a bus leaves within 10 minutes. Tap to turn off."
                aria-label="Screen kept on. Turn off"
              >
                <Sun className="size-3.5 text-warn" aria-hidden />
                <span className="hidden sm:inline">Screen on</span>
              </button>
            )}
            <button
              onClick={refresh}
              className="inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs font-medium text-ink-2 hover:bg-surface-2"
              aria-label="Refresh now"
              title="Auto-refreshes every 30 seconds"
            >
              {online ? (
                <RefreshCw className={`size-4 ${refreshing ? 'animate-spin' : ''}`} aria-hidden />
              ) : (
                <WifiOff className="size-4 text-late" aria-hidden />
              )}
              <span className="whitespace-nowrap tabular">{online ? (lastUpdated ? `Updated ${ago(lastUpdated, now)}` : 'Loading…') : 'Offline'}</span>
            </button>
            <button
              onClick={() => setManagerOpen(true)}
              className="rounded-full p-2.5 text-ink-2 hover:bg-surface-2 hover:text-ink"
              aria-label="Manage journeys"
            >
              <Settings2 className="size-5" />
            </button>
          </div>
        </div>

        {/* Journey shortcuts */}
        <nav aria-label="Journeys" className="mx-auto max-w-[90rem]">
          <div className="no-scrollbar flex gap-2 overflow-x-auto px-4 pb-3 sm:px-6">
            {loaded &&
              [{ id: ALL, name: 'All journeys' }, ...journeys].map(j => {
                const active = selected === j.id;
                const { from, to } = splitJourneyName(j.name);
                return (
                  <button
                    key={j.id}
                    onClick={() => select(j.id)}
                    aria-pressed={active}
                    className={`shrink-0 rounded-full px-3.5 py-2 text-sm font-medium transition-colors ${
                      active ? 'bg-ink text-bg' : 'bg-surface text-ink-2 ring-1 ring-line hover:text-ink'
                    }`}
                  >
                    {from}
                    {to && <span className="opacity-60"> → </span>}
                    {to}
                  </button>
                );
              })}
          </div>
        </nav>
      </header>

      {/* Body */}
      <main className="mx-auto w-full max-w-[90rem] flex-1 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(380px,42%)] lg:gap-6 lg:px-6">
        <section
          className={`px-4 py-4 sm:px-6 lg:px-0 lg:py-6 ${mobileView === 'map' ? 'hidden lg:block' : ''}`}
          aria-label="Departures"
        >
          {!online && (
            <p className="mb-4 rounded-xl bg-surface-2 px-4 py-3 text-sm text-ink-2">
              You&apos;re offline. Times below are from the last update and keep counting down.
            </p>
          )}
          {!loaded ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
              {[0, 1, 2, 3].map(i => (
                <div key={i} className="h-56 animate-pulse rounded-2xl bg-surface" />
              ))}
            </div>
          ) : journeys.length === 0 ? (
            <div className="rounded-2xl border border-line bg-surface p-10 text-center shadow-card">
              <p className="text-lg font-semibold">No journeys yet</p>
              <p className="mt-1 text-sm text-ink-3">Add the stops you use and MBus will count down to your next bus.</p>
              <button onClick={() => setManagerOpen(true)} className="mt-5 rounded-xl bg-accent px-5 py-3 font-semibold text-accent-ink">
                Add a journey
              </button>
            </div>
          ) : (
            <div className={`grid gap-4 ${selected === ALL ? 'sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2' : ''}`}>
              {visible.map(j => {
                const keys = j.stops.map(s => legKey(s.stopId, s.route));
                return (
                  <JourneyCard
                    key={j.id}
                    journey={j}
                    departures={departuresByJourney.get(j.id) ?? []}
                    now={now}
                    loading={keys.some(k => !data[k]) && !keys.every(k => errors[k])}
                    failed={keys.every(k => errors[k])}
                    vehiclesByTrip={vehiclesByTrip}
                    onRetry={refresh}
                    onShowOnMap={showOnMap}
                    onOpen={openDeparture(j.id)}
                    compact={selected === ALL}
                  />
                );
              })}
            </div>
          )}
          {hasErrors && loaded && journeys.length > 0 && (
            <p className="mt-4 text-center text-xs text-ink-3">Some lines couldn&apos;t be refreshed. Retrying automatically.</p>
          )}

          <footer className="mt-10 space-y-1 pb-24 text-center text-xs text-ink-3 lg:pb-6">
            <p>
              Live data from{' '}
              <a className="underline hover:text-ink" href="https://brezavta.si" target="_blank" rel="noopener noreferrer">
                brezavta.si
              </a>
              , timetables from{' '}
              <a className="underline hover:text-ink" href="https://vozniredi.marprom.si" target="_blank" rel="noopener noreferrer">
                Marprom
              </a>
              . Map © OpenStreetMap contributors, OpenFreeMap.
            </p>
            <p>Unofficial. Auto-refreshes every 30 s while open.</p>
          </footer>
        </section>

        <section
          aria-label="Live map"
          className={`${mobileView === 'map' ? 'block' : 'hidden'} lg:block lg:py-6`}
        >
          <div className="h-[calc(100dvh-8.5rem-env(safe-area-inset-top))] lg:sticky lg:top-[8.5rem] lg:h-[calc(100dvh-10rem)] lg:overflow-hidden lg:rounded-2xl lg:border lg:border-line lg:shadow-card">
            {loaded && (
              <LiveMap
                stops={mapStops}
                vehicles={vehicles}
                focus={focus}
                visibleKey={mobileView}
                className="h-full w-full"
              />
            )}
          </div>
        </section>
      </main>

      {/* Mobile board/map switch */}
      <div className="fixed inset-x-0 bottom-0 z-30 flex justify-center pb-[max(1rem,env(safe-area-inset-bottom))] lg:hidden">
        <div className="flex rounded-full bg-surface p-1 shadow-card ring-1 ring-line" role="tablist" aria-label="View">
          {(
            [
              ['board', 'Departures', LayoutList],
              ['map', 'Live map', MapIcon],
            ] as const
          ).map(([id, label, Icon]) => (
            <button
              key={id}
              role="tab"
              aria-selected={mobileView === id}
              onClick={() => setMobileView(id)}
              className={`inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold transition-colors ${
                mobileView === id ? 'bg-ink text-bg' : 'text-ink-2'
              }`}
            >
              <Icon className="size-4" aria-hidden /> {label}
            </button>
          ))}
        </div>
      </div>

      {trackedLive && (
        <DepartureSheet
          departure={trackedLive.departure}
          current={trackedLive.current}
          journeyName={trackedLive.journeyName}
          now={now}
          vehicle={trackedLive.departure.schedule.tripId ? vehiclesByTrip.get(trackedLive.departure.schedule.tripId) : undefined}
          wakeSupported={wake.supported}
          wakeHeld={wake.held}
          keepAwake={keepAwake}
          onToggleKeepAwake={toggleKeepAwake}
          onShowOnMap={target => {
            setTracked(null);
            showOnMap(target);
          }}
          onClose={() => setTracked(null)}
        />
      )}

      <BusStopManager isOpen={managerOpen} journeys={journeys} onClose={() => setManagerOpen(false)} onChange={updateJourneys} />
    </div>
  );
}

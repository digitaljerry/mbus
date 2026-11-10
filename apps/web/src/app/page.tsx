'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Bus, Info, LayoutList, LocateFixed, Map as MapIcon, RefreshCw, Route, Settings2, Star, Sun, WifiOff, Zap } from 'lucide-react';
import { vehicleFor, type BusStop, type Vehicle } from './types';
import { loadPinnedStops, loadUsualBuses, savePinnedStops, saveUsualBuses } from './utils/storage';
import { DEFAULT_STOPS, splitJourneyName } from './lib/defaults';
import { ago, SECONDS_THRESHOLD_MS } from './lib/format';
import { routeColor } from './lib/routeColors';
import { isoWeekday, sameUsual, WEEKDAYS, type UsualBus } from './lib/usual';
import { zonedDateString } from './lib/time';
import { useNow } from './hooks/useNow';
import { DEFAULT_BEFORE, legKey, useSchedules } from './hooks/useSchedules';
import { useVehicles } from './hooks/useVehicles';
import { useWakeLock } from './hooks/useWakeLock';
import { useGeolocation } from './hooks/useGeolocation';
import { usePush } from './hooks/usePush';
import BusStopManager from './components/BusStopManager';
import JourneyCard, { baseLaterRows, journeySequence, mergeDepartures, mergeEarlier, SHOW_MORE_STEP, type Departure } from './components/JourneyCard';
import DepartureSheet, { departureKey } from './components/DepartureSheet';
import UsualSection, { SOON_WINDOW_MS, usualDeparture, usualJourneyId } from './components/UsualSection';
import UsualBusEditor from './components/UsualBusEditor';
import NearbyView, { type NearbyStop } from './components/NearbyView';
import UsualView from './components/UsualView';
import NextUpView from './components/NextUpView';
import LinesView from './components/LinesView';
import { useNetwork } from './hooks/useNetwork';
import type { MapFocus, MapStop } from './components/LiveMap';

const LiveMap = dynamic(() => import('./components/LiveMap'), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse bg-surface-2" />,
});

const SELECTED_KEY = 'mbus-selected-journey';
const MIGRATION_KEY = 'mbus-journeys-v2';
const KEEP_AWAKE_KEY = 'mbus-keep-awake';
const ALL = 'all';
const NEARBY = 'nearby';
const USUAL = 'usual';
const NEXT = 'next';
const LINES = 'lines';
// One-time: make the new Next up tab the starting view.
const NEXT_MIGRATION_KEY = 'mbus-next-up-v1';

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

interface Tracked {
  key: string;
  /** Journey (or usual-bus pseudo journey) the departure came from, if any. */
  journeyId?: string;
  title?: string;
  last: Departure;
}

export default function Home() {
  const [journeys, setJourneys] = useState<BusStop[]>([]);
  const [usual, setUsual] = useState<UsualBus[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [selected, setSelected] = useState<string>(NEXT);
  const [managerOpen, setManagerOpen] = useState(false);
  const [mobileView, setMobileView] = useState<'board' | 'map'>('board');
  const [focus, setFocus] = useState<MapFocus>();
  const [online, setOnline] = useState(true);
  const [tracked, setTracked] = useState<Tracked | null>(null);
  const [editingUsual, setEditingUsual] = useState<{ bus: UsualBus; isNew: boolean } | null>(null);
  const [pendingUsualId, setPendingUsualId] = useState<string | null>(null);
  const [nearbyStops, setNearbyStops] = useState<NearbyStop[]>([]);
  const [keepAwake, setKeepAwake] = useState(true);
  // "Show more": extra rows per journey (reset when you switch journeys).
  const [extraRows, setExtraRows] = useState<Record<string, number>>({});
  // "Show earlier": how many already-due buses to reveal per journey.
  const [earlierRows, setEarlierRows] = useState<Record<string, number>>({});
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
    setUsual(loadUsualBuses());
    const params = new URLSearchParams(window.location.search);
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(SELECTED_KEY);
    } catch {}
    try {
      if (!localStorage.getItem(NEXT_MIGRATION_KEY)) {
        localStorage.setItem(NEXT_MIGRATION_KEY, '1');
        stored = null;
      }
    } catch {}
    const want = params.get('j') ?? stored ?? NEXT;
    setSelected([ALL, NEARBY, USUAL, NEXT, LINES].includes(want) || stops.some(s => s.id === want) ? want : NEXT);
    // Opened from a reminder notification: show that bus.
    const usualId = params.get('usual');
    if (usualId) {
      setPendingUsualId(usualId);
      setSelected(NEXT);
    }
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
    setExtraRows({});
    setEarlierRows({});
    try {
      localStorage.setItem(SELECTED_KEY, id);
    } catch {}
    const url = new URL(window.location.href);
    url.searchParams.delete('usual');
    if (id === NEXT) url.searchParams.delete('j');
    else url.searchParams.set('j', id);
    window.history.replaceState(null, '', url);
  }, []);

  const updateJourneys = useCallback(
    (next: BusStop[]) => {
      setJourneys(next);
      savePinnedStops(next);
      if (![ALL, NEARBY, USUAL, NEXT, LINES].includes(selected) && !next.some(j => j.id === selected)) select(NEXT);
    },
    [selected, select]
  );

  const updateUsual = useCallback((next: UsualBus[]) => {
    setUsual(next);
    saveUsualBuses(next);
  }, []);

  const isNearby = selected === NEARBY;
  const isUsualView = selected === USUAL;
  const isNext = selected === NEXT;
  const isLines = selected === LINES;
  const [selectedLine, setSelectedLine] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  // Views that show usual buses (and their stops/buses on the map).
  const showsUsual = selected === ALL || isUsualView || isNext;
  const visible = useMemo(
    () => (selected === ALL || selected === NEXT ? journeys : journeys.filter(j => j.id === selected)),
    [journeys, selected]
  );

  // Usual buses are fetched like one-leg journeys so they get live data too.
  const usualJourneys = useMemo<BusStop[]>(
    () => usual.map(u => ({ id: usualJourneyId(u), name: u.label ?? u.time, stops: [{ stopId: u.stopId, route: u.route, toStopId: u.toStopId }] })),
    [usual]
  );
  const fetchJourneys = useMemo(() => [...journeys, ...usualJourneys], [journeys, usualJourneys]);
  // Ask the server for enough departures on each leg to fill expanded cards
  // (any single leg could supply all of them), plus a few spare so the next
  // "Show more" is instant.
  const legLimits = useMemo(() => {
    const limits: Record<string, number> = {};
    journeys.forEach(j => {
      const extra = extraRows[j.id];
      if (!extra) return;
      const need = 1 + baseLaterRows(selected === ALL) + extra + SHOW_MORE_STEP;
      j.stops.forEach(s => {
        const k = legKey(s.stopId, s.route, s.toStopId);
        limits[k] = Math.min(80, Math.max(limits[k] ?? 0, need));
      });
    });
    return limits;
  }, [journeys, extraRows, selected]);
  const legBefores = useMemo(() => {
    const befores: Record<string, number> = {};
    journeys.forEach(j => {
      const shown = earlierRows[j.id];
      if (!shown) return;
      j.stops.forEach(s => {
        const k = legKey(s.stopId, s.route, s.toStopId);
        befores[k] = Math.min(30, Math.max(befores[k] ?? DEFAULT_BEFORE, shown + SHOW_MORE_STEP));
      });
    });
    return befores;
  }, [journeys, earlierRows]);
  const { data, errors, lastUpdated, refreshing, refresh } = useSchedules(fetchJourneys, legLimits, legBefores);

  const geo = useGeolocation(isNearby);
  const push = usePush(usual, loaded);
  const { network, failed: networkFailed } = useNetwork(isLines);

  const visibleRoutes = useMemo(() => {
    if (isNearby) return [...new Set(nearbyStops.flatMap(s => s.departures.map(d => d.route)))];
    if (isLines) return network ? network.lines.map(l => l.route) : [];
    const fromJourneys = visible.flatMap(j => j.stops.map(s => s.route.toUpperCase()));
    const fromUsual = showsUsual ? usual.map(u => u.route.toUpperCase()) : [];
    return [...new Set([...fromJourneys, ...fromUsual])];
  }, [visible, isNearby, nearbyStops, usual, showsUsual, isLines, network]);
  const { vehicles } = useVehicles(visibleRoutes, loaded);
  // All lines with one selected: only that line's buses on the map.
  const mapVehicles = useMemo(
    () => (isLines && selectedLine ? vehicles.filter(v => v.route === selectedLine) : vehicles),
    [vehicles, isLines, selectedLine]
  );

  const vehiclesByTrip = useMemo(() => {
    const m = new Map<string, Vehicle>();
    vehicles.forEach(v => {
      if (v.tripId) m.set(v.tripId, v);
      if (v.busCode) m.set(`bus:${v.busCode}`, v);
    });
    return m;
  }, [vehicles]);

  const mapStops = useMemo<MapStop[]>(() => {
    if (isLines) {
      const line = network?.lines.find(l => l.route === selectedLine);
      if (!line || !network) return [];
      const ids = [...new Set(line.variants.flatMap(v => v.stops))];
      return ids.flatMap(id => {
        const st = network.stops[id];
        return st ? [{ id, name: st[0], lat: st[1], lon: st[2], color: line.color }] : [];
      });
    }
    if (isNearby) {
      return nearbyStops.map(s => ({ id: s.stop, name: s.stopName, lat: s.lat, lon: s.lon, color: s.departures[0]?.routeColor ?? '#475569' }));
    }
    const m = new Map<string, MapStop>();
    const add = (stopId: string, route: string, toStopId?: string) => {
      const resp = data[legKey(stopId, route, toStopId)];
      if (resp?.lat && resp.lon && !m.has(stopId)) {
        m.set(stopId, { id: stopId, name: resp.stopName ?? `Stop ${stopId}`, lat: resp.lat, lon: resp.lon, color: routeColor(route, resp.routeColor) });
      }
    };
    visible.forEach(j => j.stops.forEach(s => add(s.stopId, s.route, s.toStopId)));
    if (showsUsual) usual.forEach(u => add(u.stopId, u.route, u.toStopId));
    return [...m.values()];
  }, [visible, data, isNearby, nearbyStops, usual, showsUsual, isLines, network, selectedLine]);

  const showOnMap = useCallback((target: { vehicle?: Vehicle; stopId?: string }) => {
    setFocus({ vehicleId: target.vehicle?.id, stopId: target.stopId, nonce: Date.now() });
    setMobileView('map');
  }, []);

  // Departures per visible journey, recomputed every tick.
  const departuresByJourney = useMemo(
    () => new Map(visible.map(j => [j.id, mergeDepartures(j, data, now)])),
    [visible, data, now]
  );

  // The tracked departure, refreshed from the latest data (delays move it),
  // plus its place among the journey's buses for previous/next.
  const trackedLive = useMemo(() => {
    if (!tracked) return null;
    const j = fetchJourneys.find(x => x.id === tracked.journeyId);
    const sequence = j ? journeySequence(j, data, now) : [];
    const index = sequence.findIndex(d => departureKey(d) === tracked.key);
    const title = tracked.title ?? j?.name;
    if (index >= 0) return { departure: sequence[index], current: true, title, sequence, index };
    return { departure: tracked.last, current: !j && tracked.last.schedule.epoch > now - 30_000, title, sequence, index: -1 };
  }, [tracked, fetchJourneys, data, now]);

  const openDeparture = useCallback((d: Departure, journeyId?: string, title?: string) => {
    setTracked({ key: departureKey(d), journeyId, title, last: d });
  }, []);

  // Notification tap (?usual=id): open that bus once it's loaded.
  useEffect(() => {
    if (!pendingUsualId || !now) return;
    const u = usual.find(x => x.id === pendingUsualId);
    if (u) {
      const d = usualDeparture(u, data, now);
      if (d) openDeparture(d, usualJourneyId(u), u.label ?? undefined);
    }
    setPendingUsualId(null);
  }, [pendingUsualId, usual, data, now, openDeparture]);

  const usualFor = useCallback(
    (d: Departure) => usual.find(u => sameUsual(u, d.stopId, d.route, d.schedule.scheduledTime ?? d.schedule.time)),
    [usual]
  );

  const startUsual = useCallback(
    (d: Departure) => {
      const existing = usualFor(d);
      if (existing) return setEditingUsual({ bus: existing, isNew: false });
      const date = zonedDateString(new Date(d.schedule.epoch));
      const weekday = isoWeekday(date);
      // Walking time: from Nearby if we know it.
      const walk = nearbyStops.find(s => s.stop === d.stopId)?.walkMinutes;
      setEditingUsual({
        isNew: true,
        bus: {
          id: `usual-${Date.now().toString(36)}`,
          stopId: d.stopId,
          stopName: d.stopName,
          route: d.route,
          routeColor: d.color,
          destination: d.schedule.destination,
          time: d.schedule.scheduledTime ?? d.schedule.time,
          days: weekday <= 5 ? WEEKDAYS : [weekday],
          walkMinutes: walk ?? 5,
          toStopId: d.toStopId,
          toStopName: d.toStopId ? d.toStopName : undefined,
          remind: false,
          remindBefore: 5,
          createdAt: Date.now(),
        },
      });
    },
    [usualFor, nearbyStops]
  );

  const saveNearbyAsJourney = useCallback(
    (s: NearbyStop) => {
      const routes = [...new Set(s.departures.map(d => d.route))];
      if (!routes.length) return;
      const journey: BusStop = {
        id: `journey-${Date.now()}`,
        name: `📍 ${s.stopName}`,
        description: s.departures[0]?.destination ? `Towards ${s.departures[0].destination}` : undefined,
        stops: routes.map(route => ({ stopId: s.stop, route })),
      };
      updateJourneys([...journeys, journey]);
      select(journey.id);
    },
    [journeys, updateJourneys, select]
  );

  // Keep the screen on while a bus you're looking at is about to leave.
  const soonest = useMemo(() => {
    if (trackedLive?.current) return trackedLive.departure.schedule.epoch;
    const list = [...departuresByJourney.values()].map(l => l[0]).filter(Boolean);
    if (showsUsual) usual.forEach(u => {
      const d = now ? usualDeparture(u, data, now) : null;
      if (d) list.push(d);
    });
    return Math.min(...list.map(d => d.schedule.epoch), Infinity);
  }, [departuresByJourney, trackedLive, usual, data, now, showsUsual]);
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

  const loadingJourney = (j: BusStop) => {
    const keys = j.stops.map(s => legKey(s.stopId, s.route, s.toStopId));
    return keys.some(k => !data[k]) && !keys.every(k => errors[k]);
  };

  const renderCard = (j: BusStop, compact: boolean) => {
    const keys = j.stops.map(s => legKey(s.stopId, s.route, s.toStopId));
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
        onOpen={d => openDeparture(d, j.id)}
        compact={compact}
        extra={extraRows[j.id] ?? 0}
        canLoadMore={j.stops.some(s => {
          const resp = data[legKey(s.stopId, s.route, s.toStopId)];
          return resp ? resp.schedules.length >= (resp.limit ?? 5) && (resp.limit ?? 5) < 80 : false;
        })}
        onShowMore={() => setExtraRows(r => ({ ...r, [j.id]: (r[j.id] ?? 0) + SHOW_MORE_STEP }))}
        onShowLess={() => setExtraRows(r => ({ ...r, [j.id]: 0 }))}
        past={mergeEarlier(j, data, now)}
        earlierShown={earlierRows[j.id] ?? 0}
        onShowEarlier={() => setEarlierRows(r => ({ ...r, [j.id]: (r[j.id] ?? 0) + SHOW_MORE_STEP }))}
        onHideEarlier={() => setEarlierRows(r => ({ ...r, [j.id]: 0 }))}
      />
    );
  };

  const hasErrors = Object.keys(errors).length > 0;
  const chips = [
    { id: NEXT, label: <><Zap className="mr-1 inline size-4 -translate-y-px" aria-hidden />Next up</> },
    { id: ALL, label: <>All journeys</> },
    { id: NEARBY, label: <><LocateFixed className="mr-1 inline size-4 -translate-y-px" aria-hidden />Nearby</> },
    { id: LINES, label: <><Route className="mr-1 inline size-4 -translate-y-px" aria-hidden />All lines</> },
    {
      id: USUAL,
      label: (
        <>
          <Star className="mr-1 inline size-4 -translate-y-px fill-current text-warn" aria-hidden />
          Usual buses{usual.length > 0 && <span className="ml-1 opacity-60 tabular">{usual.length}</span>}
        </>
      ),
    },
    ...journeys.map(j => {
      const { from, to } = splitJourneyName(j.name);
      return {
        id: j.id,
        label: (
          <>
            {from}
            {to && <span className="opacity-60"> → </span>}
            {to}
          </>
        ),
      };
    }),
  ];

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

          <div className="ml-auto flex items-center gap-1">
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
            <Link href="/about" className="rounded-full p-2.5 text-ink-2 hover:bg-surface-2 hover:text-ink" aria-label="About and roadmap">
              <Info className="size-5" />
            </Link>
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
              chips.map(c => {
                const active = selected === c.id;
                return (
                  <button
                    key={c.id}
                    onClick={() => select(c.id)}
                    aria-pressed={active}
                    className={`shrink-0 rounded-full px-3.5 py-2 text-sm font-medium transition-colors ${
                      active ? 'bg-ink text-bg' : 'bg-surface text-ink-2 ring-1 ring-line hover:text-ink'
                    }`}
                  >
                    {c.label}
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
          ) : isLines ? (
            <LinesView
              network={network}
              failed={networkFailed}
              vehicles={vehicles}
              selected={selectedLine}
              onSelect={setSelectedLine}
              onShowMap={() => setMobileView('map')}
              onShowStop={stopId => showOnMap({ stopId })}
            />
          ) : isNext ? (
            journeys.length === 0 && usual.length === 0 ? (
              <div className="rounded-2xl border border-line bg-surface p-10 text-center shadow-card">
                <p className="text-lg font-semibold">Nothing here yet</p>
                <p className="mt-1 text-sm text-ink-3">Add a journey and MBus will show what&apos;s next for it here.</p>
                <button onClick={() => setManagerOpen(true)} className="mt-5 rounded-xl bg-accent px-5 py-3 font-semibold text-accent-ink">
                  Add a journey
                </button>
              </div>
            ) : (
              <NextUpView
                journeys={journeys}
                departuresByJourney={departuresByJourney}
                loadingJourney={loadingJourney}
                usual={usual}
                data={data}
                now={now}
                expanded={expanded}
                onToggle={id =>
                  setExpanded(prev => {
                    const n = new Set(prev);
                    if (n.has(id)) n.delete(id);
                    else n.add(id);
                    return n;
                  })
                }
                renderCard={j => renderCard(j, false)}
                onOpenUsual={(u, d) => openDeparture(d, usualJourneyId(u), u.label)}
                onEditUsual={u => setEditingUsual({ bus: u, isNew: false })}
                onShowUsualTab={() => select(USUAL)}
              />
            )
          ) : isUsualView ? (
            <UsualView
              usual={usual}
              data={data}
              now={now}
              push={push.state}
              onEnablePush={push.enable}
              onOpen={(u, d) => openDeparture(d, usualJourneyId(u), u.label)}
              onEdit={u => setEditingUsual({ bus: u, isNew: false })}
              onBrowseJourneys={() => select(ALL)}
              onBrowseNearby={() => select(NEARBY)}
            />
          ) : isNearby ? (
            <NearbyView
              status={geo.status}
              position={geo.position}
              now={now}
              onRetry={geo.retry}
              onStops={setNearbyStops}
              onOpen={(d, title) => openDeparture(d, undefined, title)}
              onShowStop={stopId => showOnMap({ stopId })}
              onSaveJourney={saveNearbyAsJourney}
            />
          ) : (
            <>
              {selected === ALL && (
                <UsualSection
                  title="Leaving soon"
                  usual={usual.filter(u => {
                    const d = now ? usualDeparture(u, data, now) : null;
                    return d ? d.schedule.epoch - now <= SOON_WINDOW_MS : false;
                  })}
                  data={data}
                  now={now}
                  onOpen={(u, d) => openDeparture(d, usualJourneyId(u), u.label)}
                  onEdit={u => setEditingUsual({ bus: u, isNew: false })}
                />
              )}
              {journeys.length === 0 ? (
                <div className="rounded-2xl border border-line bg-surface p-10 text-center shadow-card">
                  <p className="text-lg font-semibold">No journeys yet</p>
                  <p className="mt-1 text-sm text-ink-3">Add the stops you use and MBus will count down to your next bus.</p>
                  <button onClick={() => setManagerOpen(true)} className="mt-5 rounded-xl bg-accent px-5 py-3 font-semibold text-accent-ink">
                    Add a journey
                  </button>
                </div>
              ) : (
                <div className={`grid gap-4 ${selected === ALL ? 'sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2' : ''}`}>
                  {visible.map(j => renderCard(j, selected === ALL))}
                </div>
              )}
              {selected === ALL && usual.length === 0 && journeys.length > 0 && (
                <p className="mt-4 rounded-xl bg-surface-2 px-4 py-3 text-sm text-ink-2">
                  Tip: tap a departure and choose <span className="font-medium">Make this my usual bus</span> to get a leave-by time and reminders.
                </p>
              )}
              {hasErrors && (
                <p className="mt-4 text-center text-xs text-ink-3">Some lines couldn&apos;t be refreshed. Retrying automatically.</p>
              )}
            </>
          )}

          <footer className="mt-10 space-y-1 pb-24 text-center text-xs text-ink-3 lg:pb-6">
            <p>
              Live data and timetables from{' '}
              <a className="underline hover:text-ink" href="https://vozniredi.marprom.si" target="_blank" rel="noopener noreferrer">
                Marprom
              </a>
              {' '}and{' '}
              <a className="underline hover:text-ink" href="https://brezavta.si" target="_blank" rel="noopener noreferrer">
                brezavta.si
              </a>
              . Map © OpenStreetMap contributors, OpenFreeMap.
            </p>
            <p>
              Unofficial. Auto-refreshes every 30 s while open. <Link href="/about" className="underline hover:text-ink">Features &amp; roadmap</Link>
            </p>
          </footer>
        </section>

        <section aria-label="Live map" className={`${mobileView === 'map' ? 'block' : 'hidden'} lg:block lg:py-6`}>
          <div className="h-[calc(100dvh-8.5rem-env(safe-area-inset-top))] lg:sticky lg:top-[8.5rem] lg:h-[calc(100dvh-10rem)] lg:overflow-hidden lg:rounded-2xl lg:border lg:border-line lg:shadow-card">
            {loaded && (
              <LiveMap
                stops={mapStops}
                vehicles={mapVehicles}
                focus={focus}
                visibleKey={mobileView}
                userPosition={isNearby ? geo.position : null}
                network={isLines ? network?.lines : null}
                highlightRoute={isLines ? selectedLine : null}
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
          journeyName={trackedLive.title}
          now={now}
          vehicle={vehicleFor(vehiclesByTrip, trackedLive.departure.schedule)}
          wakeSupported={wake.supported}
          wakeHeld={wake.held}
          keepAwake={keepAwake}
          onToggleKeepAwake={toggleKeepAwake}
          onShowOnMap={target => {
            setTracked(null);
            showOnMap(target);
          }}
          nav={
            trackedLive.index >= 0 && trackedLive.sequence.length > 1
              ? {
                  index: trackedLive.index,
                  total: trackedLive.sequence.length,
                  onPrev:
                    trackedLive.index > 0
                      ? () => {
                          const d = trackedLive.sequence[trackedLive.index - 1];
                          setTracked(t => t && { ...t, key: departureKey(d), last: d });
                        }
                      : undefined,
                  onNext:
                    trackedLive.index < trackedLive.sequence.length - 1
                      ? () => {
                          const d = trackedLive.sequence[trackedLive.index + 1];
                          setTracked(t => t && { ...t, key: departureKey(d), last: d });
                        }
                      : undefined,
                }
              : undefined
          }
          isUsual={Boolean(usualFor(trackedLive.departure))}
          onUsual={() => startUsual(trackedLive.departure)}
          onClose={() => setTracked(null)}
        />
      )}

      {editingUsual && (
        <UsualBusEditor
          key={editingUsual.bus.id}
          initial={editingUsual.bus}
          isNew={editingUsual.isNew}
          push={push.state}
          onEnablePush={push.enable}
          onTestPush={push.test}
          onSave={u => {
            updateUsual(editingUsual.isNew ? [...usual, u] : usual.map(x => (x.id === u.id ? u : x)));
            setEditingUsual(null);
          }}
          onDelete={
            editingUsual.isNew
              ? undefined
              : () => {
                  updateUsual(usual.filter(x => x.id !== editingUsual.bus.id));
                  setEditingUsual(null);
                }
          }
          onClose={() => setEditingUsual(null)}
        />
      )}

      <BusStopManager isOpen={managerOpen} journeys={journeys} onClose={() => setManagerOpen(false)} onChange={updateJourneys} />
    </div>
  );
}

'use client';

import { AlertTriangle, Bus, ChevronDown, ChevronRight, ChevronUp, MapPin, Moon, RefreshCw } from 'lucide-react';
import type { BusStop, Schedule, ScheduleResponse, Vehicle } from '../types';
import { countdown, dayLabel, delayInfo } from '../lib/format';
import { splitJourneyName } from '../lib/defaults';
import { legKey } from '../hooks/useSchedules';
import RouteBadge from './RouteBadge';

export interface Departure {
  schedule: Schedule;
  route: string;
  color: string;
  stopId: string;
  stopName?: string;
  toStopId?: string;
  toStopName?: string;
  source: ScheduleResponse['source'];
}

const toDeparture = (resp: ScheduleResponse, schedule: Schedule): Departure => ({
  schedule,
  route: resp.route,
  color: resp.routeColor,
  stopId: resp.stop,
  stopName: resp.stopName,
  toStopId: resp.toStop,
  toStopName: resp.toStopName,
  source: resp.source,
});

/** Merge the departures of all stop/route legs of a journey, soonest first. */
export function mergeDepartures(journey: BusStop, data: Record<string, ScheduleResponse>, now: number): Departure[] {
  const out: Departure[] = [];
  for (const leg of journey.stops) {
    const resp = data[legKey(leg.stopId, leg.route, leg.toStopId)];
    resp?.schedules.forEach(schedule => out.push(toDeparture(resp, schedule)));
  }
  return out
    .filter(d => !now || !countdown(d.schedule.epoch, now).departed)
    .sort((a, b) => a.schedule.epoch - b.schedule.epoch);
}

/** Departures that are already due (oldest first): the server's `earlier` plus any that passed since. */
export function mergeEarlier(journey: BusStop, data: Record<string, ScheduleResponse>, now: number): Departure[] {
  if (!now) return [];
  const seen = new Set<string>();
  const out: Departure[] = [];
  for (const leg of journey.stops) {
    const resp = data[legKey(leg.stopId, leg.route, leg.toStopId)];
    if (!resp) continue;
    [...(resp.earlier ?? []), ...resp.schedules.filter(s => countdown(s.epoch, now).departed)].forEach(s => {
      const k = `${resp.stop}|${resp.route}|${s.scheduledTime ?? s.time}|${Math.round(s.epoch / 3_600_000)}`;
      if (seen.has(k)) return;
      seen.add(k);
      out.push(toDeparture(resp, s));
    });
  }
  return out.sort((a, b) => a.schedule.epoch - b.schedule.epoch);
}

/** Every departure we know for a journey, oldest first (for stepping through them). */
export function journeySequence(journey: BusStop, data: Record<string, ScheduleResponse>, now: number): Departure[] {
  return [...mergeEarlier(journey, data, now), ...mergeDepartures(journey, data, now)];
}

/** A timetable-only bus that was due a few minutes ago may simply be late. */
export const JUST_DUE_MS = 5 * 60_000;

function agoText(epoch: number, now: number) {
  const mins = Math.max(0, Math.floor((now - epoch) / 60_000));
  return mins < 1 ? 'just now' : `${mins} min ago`;
}

function PastRow({ d, now, onOpen, highlight }: { d: Departure; now: number; onOpen: (d: Departure) => void; highlight?: boolean }) {
  const live = d.schedule.realtime;
  return (
    <li>
      <button
        onClick={() => onOpen(d)}
        className={`-mx-2 flex w-[calc(100%+1rem)] items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-surface-2 ${highlight ? '' : 'opacity-60'}`}
      >
        <RouteBadge route={d.route} color={d.color} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm text-ink-2">{d.schedule.destination ?? d.stopName}</p>
          {highlight && !live && <p className="truncate text-xs text-warn">No live data, may still be coming</p>}
        </div>
        <div className="flex shrink-0 items-baseline gap-2 text-right tabular">
          <span className="text-sm text-ink-3 line-through decoration-ink-3/40">{d.schedule.time}</span>
          <span className="w-20 text-xs font-medium text-ink-3">{live ? 'left' : 'was due'} {agoText(d.schedule.epoch, now)}</span>
        </div>
      </button>
    </li>
  );
}

const toneClass = { ok: 'text-live', warn: 'text-warn', late: 'text-late' } as const;

function Status({ d }: { d: Departure }) {
  const delay = d.schedule.realtime ? delayInfo(d.schedule.delay) : null;
  if (d.schedule.realtime) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium">
        <span className="live-dot" aria-hidden />
        <span className={delay ? toneClass[delay.tone] : 'text-live'}>{delay?.text ?? 'Live'}</span>
      </span>
    );
  }
  return <span className="text-xs text-ink-3">Scheduled</span>;
}

interface Props {
  journey: BusStop;
  departures: Departure[];
  now: number;
  loading: boolean;
  failed: boolean;
  vehiclesByTrip: Map<string, Vehicle>;
  onRetry: () => void;
  onShowOnMap: (target: { vehicle?: Vehicle; stopId?: string }) => void;
  onOpen: (d: Departure) => void;
  compact?: boolean;
  /** Extra rows revealed with "Show more". */
  extra?: number;
  /** The server may have more departures than we've fetched. */
  canLoadMore?: boolean;
  onShowMore?: () => void;
  onShowLess?: () => void;
  /** Departures already due, oldest first. */
  past?: Departure[];
  /** How many of `past` to reveal ("Show earlier"). */
  earlierShown?: number;
  onShowEarlier?: () => void;
  onHideEarlier?: () => void;
}

export const SHOW_MORE_STEP = 5;
export const baseLaterRows = (compact?: boolean) => (compact ? 2 : 3);

export default function JourneyCard({
  journey,
  departures,
  now,
  loading,
  failed,
  vehiclesByTrip,
  onRetry,
  onShowOnMap,
  onOpen,
  compact,
  extra = 0,
  canLoadMore,
  onShowMore,
  onShowLess,
  past = [],
  earlierShown = 0,
  onShowEarlier,
  onHideEarlier,
}: Props) {
  const { from, to } = splitJourneyName(journey.name);
  const [next, ...rest] = departures;
  const shownLater = baseLaterRows(compact) + extra;
  const later = rest.slice(0, shownLater);
  const hasHidden = rest.length > shownLater;
  const waitingForMore = !hasHidden && Boolean(canLoadMore) && rest.length < shownLater;
  const exhausted = !hasHidden && !canLoadMore;
  const routes = [...new Set(journey.stops.map(s => s.route.toUpperCase()))];
  const colorFor = (route: string) => departures.find(d => d.route === route)?.color;
  // Always show buses that were due in the last few minutes without live data
  // (they may be late); "Show earlier" reveals more.
  const justDue = now ? past.filter(d => !d.schedule.realtime && now - d.schedule.epoch < JUST_DUE_MS) : [];
  const pastCount = Math.min(past.length, Math.max(earlierShown, justDue.length));
  const shownPast = pastCount > 0 ? past.slice(past.length - pastCount) : [];
  const canShowEarlier = Boolean(onShowEarlier) && past.length > shownPast.length;

  return (
    <article className="flex flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
      <header className="flex items-start justify-between gap-3 px-4 pt-4 sm:px-5">
        <div className="min-w-0">
          <h2 className="truncate text-base font-semibold leading-tight sm:text-lg">
            {from}
            {to && (
              <>
                <span className="mx-1.5 text-ink-3">→</span>
                {to}
              </>
            )}
          </h2>
          {journey.description && <p className="mt-0.5 truncate text-sm text-ink-3">{journey.description}</p>}
        </div>
        <div className="flex shrink-0 flex-wrap justify-end gap-1">
          {routes.map(r => (
            <RouteBadge key={r} route={r} color={colorFor(r) ?? '#64748b'} size="sm" />
          ))}
        </div>
      </header>

      <div className="flex-1 px-4 pb-4 pt-3 sm:px-5">
        {!next && loading ? (
          <div className="space-y-3" aria-busy>
            <div className="h-20 animate-pulse rounded-xl bg-surface-2" />
            <div className="h-10 animate-pulse rounded-lg bg-surface-2" />
          </div>
        ) : !next && failed ? (
          <div className="flex items-center justify-between gap-3 rounded-xl bg-surface-2 p-4">
            <p className="flex items-center gap-2 text-sm text-ink-2">
              <AlertTriangle className="size-4 text-late" aria-hidden /> Couldn&apos;t load departures
            </p>
            <button onClick={onRetry} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-accent hover:bg-surface">
              <RefreshCw className="size-4" aria-hidden /> Retry
            </button>
          </div>
        ) : !next ? (
          <div className="flex items-center gap-3 rounded-xl bg-surface-2 p-4 text-sm text-ink-2">
            <Moon className="size-5 text-ink-3" aria-hidden />
            No departures found for the next day.
          </div>
        ) : (
          <>
            {(canShowEarlier || earlierShown > 0) && (
              <div className="-mt-1 mb-1 flex items-center justify-between">
                {canShowEarlier ? (
                  <button onClick={onShowEarlier} className="inline-flex items-center gap-1 rounded-lg py-1 text-xs font-medium text-ink-3 hover:text-ink">
                    <ChevronUp className="size-3.5" aria-hidden /> Show earlier
                  </button>
                ) : (
                  <span />
                )}
                {earlierShown > 0 && (
                  <button onClick={onHideEarlier} className="rounded-lg py-1 text-xs font-medium text-ink-3 hover:text-ink">
                    Hide earlier
                  </button>
                )}
              </div>
            )}
            {shownPast.length > 0 && (
              <ul className="mb-2 divide-y divide-line">
                {shownPast.map(d => (
                  <PastRow key={`past-${d.stopId}-${d.route}-${d.schedule.epoch}`} d={d} now={now} onOpen={onOpen} highlight={justDue.includes(d)} />
                ))}
              </ul>
            )}
            <NextDeparture d={next} now={now} vehicle={next.schedule.tripId ? vehiclesByTrip.get(next.schedule.tripId) : undefined} onShowOnMap={onShowOnMap} onOpen={onOpen} />
            {later.length > 0 && (
              <ul className="mt-2 divide-y divide-line">
                {later.map((d, i) => {
                  const c = countdown(d.schedule.epoch, now);
                  const day = now ? dayLabel(d.schedule.epoch, now) : undefined;
                  return (
                    <li key={`${d.stopId}-${d.route}-${d.schedule.epoch}-${i}`}>
                      <button
                        onClick={() => onOpen(d)}
                        className="-mx-2 flex w-[calc(100%+1rem)] items-center gap-3 rounded-lg px-2 py-2.5 text-left hover:bg-surface-2"
                        aria-label={`${d.route} to ${d.schedule.destination ?? ''} at ${d.schedule.time}, ${c.label}. Open countdown`}
                      >
                      <RouteBadge route={d.route} color={d.color} size="sm" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm text-ink-2">{d.schedule.destination ?? d.stopName}</p>
                        {d.schedule.arrivalTime && (
                          <p className="truncate text-xs text-ink-3 tabular">
                            arrives {d.schedule.arrivalEstimated ? '~' : ''}{d.schedule.arrivalTime}
                          </p>
                        )}
                      </div>
                      <div className="flex shrink-0 items-baseline gap-2 tabular">
                        {day && <span className="text-xs font-medium text-ink-3">{day}</span>}
                        <span className="text-sm text-ink-3">{d.schedule.time}</span>
                        <span className={`w-16 text-right text-sm font-semibold ${c.urgent ? 'text-accent' : ''}`}>
                          {now ? (c.unit ? `${c.value} ${c.unit}` : c.value) : '—'}
                        </span>
                      </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            {onShowMore && (hasHidden || canLoadMore || extra > 0) && (
              <div className="mt-2 flex items-center gap-2">
                {!exhausted && (
                  <button
                    onClick={onShowMore}
                    disabled={waitingForMore}
                    className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-surface-2 px-4 py-2.5 text-sm font-semibold text-ink-2 hover:text-ink disabled:opacity-60"
                  >
                    {waitingForMore ? (
                      <>
                        <RefreshCw className="size-4 animate-spin" aria-hidden /> Loading more…
                      </>
                    ) : (
                      <>
                        <ChevronDown className="size-4" aria-hidden /> Show later
                      </>
                    )}
                  </button>
                )}
                {exhausted && extra > 0 && (
                  <p className="flex-1 text-center text-xs text-ink-3">That&apos;s every bus until the end of tomorrow.</p>
                )}
                {extra > 0 && (
                  <button
                    onClick={onShowLess}
                    className="inline-flex items-center justify-center gap-1 rounded-xl px-3 py-2.5 text-sm font-medium text-ink-3 hover:text-ink"
                  >
                    <ChevronUp className="size-4" aria-hidden /> Less
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </article>
  );
}

function NextDeparture({ d, now, vehicle, onShowOnMap, onOpen }: { d: Departure; now: number; vehicle?: Vehicle; onShowOnMap: Props['onShowOnMap']; onOpen: Props['onOpen'] }) {
  const c = countdown(d.schedule.epoch, now);
  const day = now ? dayLabel(d.schedule.epoch, now) : undefined;
  const delayed = d.schedule.realtime && d.schedule.scheduledTime && d.schedule.scheduledTime !== d.schedule.time;

  return (
    <div className="rounded-xl bg-surface-2 p-3.5 sm:p-4">
      <button onClick={() => onOpen(d)} className="flex w-full items-center justify-between gap-3 text-left" aria-label={`${d.route} ${c.label}. Open countdown`}>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <RouteBadge route={d.route} color={d.color} size="md" />
            <Status d={d} />
          </div>
          <p className="mt-2 truncate text-sm text-ink-2">
            {d.schedule.destination ? <>to <span className="font-medium text-ink">{d.schedule.destination}</span></> : d.stopName}
          </p>
          <p className="mt-0.5 text-xs text-ink-3 tabular">
            {day && <span className="font-medium">{day} · </span>}
            Departs {d.schedule.time}
            {delayed && <span className="ml-1 line-through opacity-70">{d.schedule.scheduledTime}</span>}
            {d.stopName && <> · {d.stopName}</>}
          </p>
          {d.schedule.arrivalTime && (
            <p className="mt-0.5 text-xs font-medium text-ink-2 tabular">
              Arrives {d.schedule.arrivalEstimated ? '~' : ''}{d.schedule.arrivalTime}
              {d.toStopName && <span className="font-normal text-ink-3"> at {d.toStopName}</span>}
              {now > 0 && d.schedule.arrivalEpoch && (
                <span className="font-normal text-ink-3"> · {Math.max(1, Math.round((d.schedule.arrivalEpoch - d.schedule.epoch) / 60000))} min ride</span>
              )}
            </p>
          )}
        </div>
        <div className="shrink-0 text-right" aria-live="polite" aria-label={c.label}>
          <span className={`block text-4xl font-bold leading-none tracking-tight tabular sm:text-5xl ${c.urgent ? 'text-accent' : ''}`}>
            {now ? c.value : '—'}
          </span>
          {c.unit && <span className="text-sm font-medium text-ink-3">{c.unit}</span>}
        </div>
      </button>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {vehicle ? (
          <button
            onClick={() => onShowOnMap({ vehicle })}
            className="inline-flex items-center gap-1.5 rounded-lg bg-surface px-2.5 py-1.5 text-xs font-medium text-ink-2 ring-1 ring-line hover:text-ink"
          >
            <Bus className="size-3.5 text-live" aria-hidden />
            {vehicle.nextStop ? `Bus near ${vehicle.nextStop}` : 'Track this bus'}
          </button>
        ) : (
          <button
            onClick={() => onShowOnMap({ stopId: d.stopId })}
            className="inline-flex items-center gap-1.5 rounded-lg bg-surface px-2.5 py-1.5 text-xs font-medium text-ink-2 ring-1 ring-line hover:text-ink"
          >
            <MapPin className="size-3.5" aria-hidden /> Show stop
          </button>
        )}
        <button
          onClick={() => onOpen(d)}
          className="ml-auto inline-flex items-center gap-0.5 rounded-lg px-1.5 py-1.5 text-xs font-medium text-ink-3 hover:text-ink"
        >
          Track <ChevronRight className="size-3.5" aria-hidden />
        </button>
      </div>
    </div>
  );
}

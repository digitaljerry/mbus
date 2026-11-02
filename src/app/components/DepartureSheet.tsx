'use client';

import { useEffect, useRef } from 'react';
import { Bus, ChevronLeft, ChevronRight, MapPin, Star, Sun, SunDim, X } from 'lucide-react';
import type { Vehicle } from '../types';
import { countdown, dayLabel, delayInfo } from '../lib/format';
import { zonedDateString } from '../lib/time';
import RouteBadge from './RouteBadge';
import type { Departure } from './JourneyCard';

/** Stable identity for a departure across refreshes (times shift with delays). */
export function departureKey(d: Departure): string {
  const scheduledEpoch = d.schedule.epoch - (d.schedule.delay ?? 0) * 1000;
  return [d.stopId, d.route, d.schedule.scheduledTime ?? d.schedule.time, zonedDateString(new Date(scheduledEpoch))].join('|');
}

interface Props {
  departure: Departure;
  /** False once the departure no longer appears in fresh data (it left). */
  current: boolean;
  journeyName?: string;
  now: number;
  vehicle?: Vehicle;
  wakeSupported: boolean;
  wakeHeld: boolean;
  keepAwake: boolean;
  onToggleKeepAwake: () => void;
  onShowOnMap: (target: { vehicle?: Vehicle; stopId?: string }) => void;
  /** Set when this departure is one of your usual buses. */
  isUsual: boolean;
  onUsual: () => void;
  /** Step to the previous/next bus of the same journey (buttons + swipe). */
  nav?: { index: number; total: number; onPrev?: () => void; onNext?: () => void };
  onClose: () => void;
}

export default function DepartureSheet({
  departure: d,
  current,
  journeyName,
  now,
  vehicle,
  wakeSupported,
  wakeHeld,
  keepAwake,
  onToggleKeepAwake,
  onShowOnMap,
  isUsual,
  onUsual,
  nav,
  onClose,
}: Props) {
  const c = countdown(d.schedule.epoch, now);
  const gone = !current && d.schedule.epoch < now;
  // Already due: a timetable-only bus may just be late; a live one has left.
  const past = !gone && c.departed;
  const minsAgo = Math.max(0, Math.floor((now - d.schedule.epoch) / 60_000));
  const touch = useRef<{ x: number; y: number } | null>(null);
  const onTouchStart = (e: React.TouchEvent) => {
    touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const start = touch.current;
    touch.current = null;
    if (!start || !nav) return;
    const dx = e.changedTouches[0].clientX - start.x;
    const dy = e.changedTouches[0].clientY - start.y;
    if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    if (dx < 0) nav.onNext?.();
    else nav.onPrev?.();
  };
  const day = now ? dayLabel(d.schedule.epoch, now) : undefined;
  const delay = d.schedule.realtime ? delayInfo(d.schedule.delay) : null;
  const delayed = d.schedule.realtime && d.schedule.scheduledTime && d.schedule.scheduledTime !== d.schedule.time;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') nav?.onPrev?.();
      if (e.key === 'ArrowRight') nav?.onNext?.();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose, nav]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${d.route} to ${d.schedule.destination ?? ''}`}
        className="relative w-full rounded-t-3xl bg-surface pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl sm:max-w-md sm:rounded-3xl"
      >
        <div className="mx-auto mt-2 h-1.5 w-10 rounded-full bg-line sm:hidden" aria-hidden />
        <header className="flex items-start justify-between gap-3 px-5 pt-4">
          <div className="min-w-0">
            {journeyName && <p className="truncate text-xs font-medium text-ink-3">{journeyName}</p>}
            <div className="mt-1 flex items-center gap-2">
              <RouteBadge route={d.route} color={d.color} size="lg" />
              <p className="min-w-0 truncate text-base font-semibold">{d.schedule.destination ?? d.stopName}</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-full p-2 text-ink-3 hover:bg-surface-2 hover:text-ink" aria-label="Close">
            <X className="size-5" />
          </button>
        </header>

        <div className="relative px-5 py-8 text-center" aria-live="off" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
          {nav && (
            <>
              <button
                onClick={nav.onPrev}
                disabled={!nav.onPrev}
                aria-label="Previous bus"
                className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full p-3 text-ink-3 hover:bg-surface-2 hover:text-ink disabled:opacity-20"
              >
                <ChevronLeft className="size-6" />
              </button>
              <button
                onClick={nav.onNext}
                disabled={!nav.onNext}
                aria-label="Next bus"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-3 text-ink-3 hover:bg-surface-2 hover:text-ink disabled:opacity-20"
              >
                <ChevronRight className="size-6" />
              </button>
            </>
          )}
          <p className="text-sm font-medium text-ink-3">
            {gone ? 'This bus has left' : past ? (d.schedule.realtime ? 'Left' : 'Was due') : 'Departs in'}
          </p>
          <p
            className={`mt-1 text-7xl font-bold leading-none tracking-tight tabular sm:text-8xl ${c.urgent && !gone && !past ? 'text-accent' : ''} ${gone || past ? 'text-ink-3' : ''}`}
            role="timer"
            aria-label={past ? `${minsAgo} minutes ago` : c.label}
          >
            {!now || gone ? '—' : past ? (minsAgo < 1 ? 'Now' : minsAgo) : c.value}
          </p>
          {past && minsAgo >= 1 && <p className="mt-1 text-lg font-medium text-ink-3">min ago</p>}
          {!past && c.unit && !gone && <p className="mt-1 text-lg font-medium text-ink-3">{c.unit}</p>}
          <p className="mt-4 text-sm text-ink-2 tabular">
            {day && <span className="font-medium">{day} · </span>}
            {d.schedule.time}
            {delayed && <span className="ml-1.5 line-through opacity-60">{d.schedule.scheduledTime}</span>}
            {d.stopName && <> · {d.stopName}</>}
          </p>
          <p className="mt-2 inline-flex items-center gap-1.5 text-xs">
            {d.schedule.realtime ? (
              <>
                <span className="live-dot" aria-hidden />
                <span className="font-medium text-live">{delay?.text ?? 'Live'}</span>
                <span className="text-ink-3">· real-time estimate</span>
              </>
            ) : past ? (
              <span className="text-warn">No live data. If it hasn&apos;t come yet, it&apos;s running late.</span>
            ) : (
              <span className="text-ink-3">Timetable time{d.source === 'marprom' ? ' (Marprom)' : ''}, no live data</span>
            )}
          </p>
          {nav && nav.total > 1 && (
            <p className="mt-3 text-[0.7rem] text-ink-3 sm:hidden">Swipe for the previous or next bus</p>
          )}
        </div>

        <div className="flex flex-col gap-2 px-5">
          <button
            onClick={() => onShowOnMap(vehicle ? { vehicle } : { stopId: d.stopId })}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-surface-2 px-4 py-3 text-sm font-semibold"
          >
            {vehicle ? <Bus className="size-4 text-live" aria-hidden /> : <MapPin className="size-4" aria-hidden />}
            {vehicle ? (vehicle.nextStop ? `See bus on map · near ${vehicle.nextStop}` : 'See bus on map') : 'Show stop on map'}
          </button>
          <button
            onClick={onUsual}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-surface-2 px-4 py-3 text-sm font-semibold"
          >
            <Star className={`size-4 ${isUsual ? 'fill-current text-warn' : ''}`} aria-hidden />
            {isUsual ? 'Your usual bus · Edit' : 'Make this my usual bus'}
          </button>
          {d.schedule.arrivalTime && (
            <p className="text-center text-xs text-ink-2 tabular">
              Arrives {d.schedule.arrivalEstimated ? '~' : ''}
              {d.schedule.arrivalTime}
              {d.toStopName ? ` at ${d.toStopName}` : ''}
            </p>
          )}
          {wakeSupported && (
            <button
              onClick={onToggleKeepAwake}
              aria-pressed={keepAwake}
              className="inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium text-ink-2 hover:bg-surface-2"
            >
              {keepAwake ? <Sun className={`size-4 ${wakeHeld ? 'text-warn' : ''}`} aria-hidden /> : <SunDim className="size-4" aria-hidden />}
              {keepAwake
                ? wakeHeld
                  ? 'Screen stays on until the bus leaves'
                  : 'Screen will stay on in the last 10 min'
                : 'Keep screen on: off'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

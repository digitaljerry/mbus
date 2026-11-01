'use client';

import { useEffect } from 'react';
import { Bus, MapPin, Sun, SunDim, X } from 'lucide-react';
import type { Vehicle } from '../types';
import { countdown, dayLabel, delayInfo } from '../lib/format';
import { zonedDateString } from '../lib/time';
import RouteBadge from './RouteBadge';
import type { Departure } from './JourneyCard';

/** Stable identity for a departure across refreshes (times shift with delays). */
export function departureKey(d: Departure): string {
  const scheduledEpoch = d.schedule.epoch - (d.schedule.delay ?? 0) * 1000;
  return [d.stopId, d.route, d.schedule.tripId ?? '', d.schedule.scheduledTime ?? d.schedule.time, zonedDateString(new Date(scheduledEpoch))].join('|');
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
  onClose,
}: Props) {
  const c = countdown(d.schedule.epoch, now);
  const gone = !current && d.schedule.epoch < now;
  const day = now ? dayLabel(d.schedule.epoch, now) : undefined;
  const delay = d.schedule.realtime ? delayInfo(d.schedule.delay) : null;
  const delayed = d.schedule.realtime && d.schedule.scheduledTime && d.schedule.scheduledTime !== d.schedule.time;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

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

        <div className="px-5 py-8 text-center" aria-live="off">
          <p className="text-sm font-medium text-ink-3">{gone ? 'This bus has left' : c.departed ? 'Departed' : 'Departs in'}</p>
          <p
            className={`mt-1 text-7xl font-bold leading-none tracking-tight tabular sm:text-8xl ${c.urgent && !gone ? 'text-accent' : ''} ${gone ? 'text-ink-3' : ''}`}
            role="timer"
            aria-label={c.label}
          >
            {now ? (gone ? '—' : c.value) : '—'}
          </p>
          {c.unit && !gone && <p className="mt-1 text-lg font-medium text-ink-3">{c.unit}</p>}
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
            ) : (
              <span className="text-ink-3">Timetable time{d.source === 'marprom' ? ' (Marprom)' : ''}, no live data</span>
            )}
          </p>
        </div>

        <div className="flex flex-col gap-2 px-5">
          <button
            onClick={() => onShowOnMap(vehicle ? { vehicle } : { stopId: d.stopId })}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-surface-2 px-4 py-3 text-sm font-semibold"
          >
            {vehicle ? <Bus className="size-4 text-live" aria-hidden /> : <MapPin className="size-4" aria-hidden />}
            {vehicle ? (vehicle.nextStop ? `See bus on map · near ${vehicle.nextStop}` : 'See bus on map') : 'Show stop on map'}
          </button>
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

'use client';

import { Bell, Footprints, Pencil, Star } from 'lucide-react';
import type { ScheduleResponse } from '../types';
import { countdown, dayLabel } from '../lib/format';
import { formatClock, zonedDateString } from '../lib/time';
import { describeDays, nextOccurrences, type UsualBus } from '../lib/usual';
import { routeColor } from '../lib/routeColors';
import { legKey } from '../hooks/useSchedules';
import RouteBadge from './RouteBadge';
import type { Departure } from './JourneyCard';

export const usualJourneyId = (u: UsualBus) => `usual:${u.id}`;

/** Usual buses shown outside their own tab: only when leaving within this window. */
export const SOON_WINDOW_MS = 60 * 60_000;

/** The next instance of a usual bus as a Departure, live if we have data for it. */
export function usualDeparture(u: UsualBus, data: Record<string, ScheduleResponse>, now: number): Departure | null {
  const occ = nextOccurrences(u, now - 60_000)[0];
  if (!occ) return null;
  const resp = data[legKey(u.stopId, u.route, u.toStopId)];
  const live = resp?.schedules.find(
    s => s.scheduledTime === u.time && zonedDateString(new Date(s.epoch - (s.delay ?? 0) * 1000)) === occ.date
  );
  return {
    schedule: live ?? {
      time: u.time,
      scheduledTime: u.time,
      epoch: occ.departEpoch,
      destination: u.destination,
      realtime: false,
    },
    route: u.route,
    color: routeColor(u.route, resp?.routeColor ?? u.routeColor),
    stopId: u.stopId,
    stopName: resp?.stopName ?? u.stopName,
    toStopId: u.toStopId,
    toStopName: resp?.toStopName ?? u.toStopName,
    source: live ? resp!.source : 'marprom',
  };
}

interface Props {
  usual: UsualBus[];
  data: Record<string, ScheduleResponse>;
  now: number;
  onOpen: (u: UsualBus, d: Departure) => void;
  onEdit: (u: UsualBus) => void;
  /** Show the edit (pencil) button on each row. */
  editable?: boolean;
  title?: string;
}

export default function UsualSection({ usual, data, now, onOpen, onEdit, editable = false, title = 'Your usual buses' }: Props) {
  if (!usual.length) return null;

  const rows = usual
    .map(u => ({ u, d: now ? usualDeparture(u, data, now) : null }))
    .sort((a, b) => (a.d?.schedule.epoch ?? Infinity) - (b.d?.schedule.epoch ?? Infinity));

  return (
    <section aria-labelledby="usual-heading" className="mb-5">
      <h2 id="usual-heading" className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-ink-2">
        <Star className="size-4 fill-current text-warn" aria-hidden /> {title}
      </h2>
      <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
        <ul className="divide-y divide-line">
          {rows.map(({ u, d }) => {
            const leaveEpoch = d ? d.schedule.epoch - u.walkMinutes * 60_000 : 0;
            const leave = d ? countdown(leaveEpoch, now) : null;
            const depart = d ? countdown(d.schedule.epoch, now) : null;
            const day = d ? dayLabel(d.schedule.epoch, now) : undefined;
            const leaveNow = leave && (leave.value === 'Now' || leave.departed) && depart && !depart.departed;
            return (
              <li key={u.id} className="flex items-stretch">
                <button
                  onClick={() => d && onOpen(u, d)}
                  className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3 text-left hover:bg-surface-2"
                >
                  <RouteBadge route={u.route} color={d?.color ?? routeColor(u.route, u.routeColor)} size="md" />
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 truncate text-sm font-semibold">
                      {u.label || `${u.time} from ${u.stopName ?? `stop ${u.stopId}`}`}
                      {u.remind && <Bell className="size-3.5 shrink-0 text-accent" aria-label="Reminder on" />}
                    </p>
                    <p className="truncate text-xs text-ink-3 tabular">
                      {day ? `${day} · ` : ''}
                      {d ? d.schedule.time : u.time}
                      {d?.schedule.realtime && d.schedule.scheduledTime !== d.schedule.time && (
                        <span className="ml-1 line-through">{d.schedule.scheduledTime}</span>
                      )}
                      {u.destination ? ` → ${u.destination}` : ''} · {describeDays(u.days)}
                    </p>
                    {d && (
                      <p className={`mt-0.5 truncate text-xs font-medium tabular ${leaveNow || leave?.urgent ? 'text-accent' : 'text-ink-2'}`}>
                        <Footprints className="mr-1 inline size-3.5 -translate-y-px" aria-hidden />
                        {leaveNow
                          ? 'Leave now'
                          : leave && leave.unit === '' && !leave.value.includes('h')
                            ? `Leave in ${leave.value}`
                            : `Leave by ${formatClock(leaveEpoch)}`}
                        <span className="font-normal text-ink-3"> · {u.walkMinutes} min walk</span>
                        {d.schedule.arrivalTime && <span className="font-normal text-ink-3"> · arrives {d.schedule.arrivalTime}</span>}
                      </p>
                    )}
                  </div>
                  {depart && (
                    <div className="shrink-0 text-right">
                      <span className={`block text-2xl font-bold leading-none tabular ${depart.urgent ? 'text-accent' : ''}`}>{depart.value}</span>
                      {depart.unit && <span className="text-xs text-ink-3">{depart.unit}</span>}
                    </div>
                  )}
                </button>
                {editable && (
                <button onClick={() => onEdit(u)} aria-label={`Edit ${u.label || u.time}`} className="px-3 text-ink-3 hover:bg-surface-2 hover:text-ink">
                  <Pencil className="size-4" />
                </button>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

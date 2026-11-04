// "Usual buses": a bus you take regularly (stop + line + timetable time on
// certain weekdays). Pure functions only, shared by the browser and the
// reminder workflow on the server.

import { addDays, hhmmToSeconds, serviceTimeToEpoch, zonedDateString } from './time';

export interface UsualBus {
  id: string;
  /** Optional name, e.g. "School run". */
  label?: string;
  stopId: string;
  stopName?: string;
  route: string;
  routeColor?: string;
  /** Headsign, to tell directions apart. */
  destination?: string;
  /** Timetabled departure time, HH:MM. */
  time: string;
  /** ISO weekdays: 1 = Monday … 7 = Sunday. */
  days: number[];
  /** Minutes it takes you to walk to the stop. */
  walkMinutes: number;
  toStopId?: string;
  toStopName?: string;
  /** Send a push notification before you need to leave. */
  remind: boolean;
  /** How many minutes before the leave-by time to notify. */
  remindBefore: number;
  createdAt: number;
}

export const WEEKDAYS = [1, 2, 3, 4, 5];
export const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** ISO weekday (1 = Mon … 7 = Sun) of a YYYY-MM-DD date. */
export function isoWeekday(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  const js = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return js === 0 ? 7 : js;
}

export function describeDays(days: number[]): string {
  const set = [...new Set(days)].sort();
  const key = set.join(',');
  if (key === '1,2,3,4,5,6,7') return 'Every day';
  if (key === '1,2,3,4,5') return 'Weekdays';
  if (key === '6,7') return 'Weekends';
  return set.map(d => DAY_NAMES[d - 1]).join(', ');
}

export interface Occurrence {
  /** Service date, YYYY-MM-DD (Ljubljana). */
  date: string;
  /** Timetabled departure, epoch ms. */
  departEpoch: number;
  /** departEpoch − walk time. */
  leaveEpoch: number;
  /** When a reminder should fire. */
  notifyEpoch: number;
  key: string;
}

export function occurrenceOn(u: UsualBus, date: string): Occurrence {
  const departEpoch = serviceTimeToEpoch(date, hhmmToSeconds(u.time));
  const leaveEpoch = departEpoch - u.walkMinutes * 60_000;
  return { date, departEpoch, leaveEpoch, notifyEpoch: leaveEpoch - u.remindBefore * 60_000, key: `${u.id}@${date}` };
}

/** Upcoming occurrences whose departure is after `from` (within ~9 days). */
export function nextOccurrences(u: UsualBus, from: number, count = 1): Occurrence[] {
  const out: Occurrence[] = [];
  if (!u.days.length) return out;
  const today = zonedDateString(new Date(from));
  for (let i = 0; i < 9 && out.length < count; i++) {
    const date = addDays(today, i);
    if (!u.days.includes(isoWeekday(date))) continue;
    const occ = occurrenceOn(u, date);
    if (occ.departEpoch > from) out.push(occ);
  }
  return out;
}

/** Same stop, line and timetable time → the same usual bus. */
export function sameUsual(u: Pick<UsualBus, 'stopId' | 'route' | 'time'>, stopId: string, route: string, time?: string) {
  return u.stopId === stopId && u.route.toUpperCase() === route.toUpperCase() && u.time === time;
}

/** Sanitise untrusted input (e.g. from the reminder sync API). */
export function cleanUsualBus(x: unknown): UsualBus | null {
  if (!x || typeof x !== 'object') return null;
  const o = x as Record<string, unknown>;
  const str = (v: unknown, max = 80) => (typeof v === 'string' ? v.slice(0, max) : undefined);
  const id = str(o.id, 64);
  const stopId = str(o.stopId, 10);
  const route = str(o.route, 8)?.toUpperCase();
  const time = str(o.time, 5);
  if (!id || !stopId || !/^\d+$/.test(stopId) || !route || !/^[A-Z0-9]+$/.test(route) || !time || !/^\d{2}:\d{2}$/.test(time)) {
    return null;
  }
  const num = (v: unknown, min: number, max: number, dflt: number) =>
    typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : dflt;
  const days = Array.isArray(o.days) ? [...new Set(o.days.filter((d): d is number => Number.isInteger(d) && d >= 1 && d <= 7))] : [];
  const toStopId = str(o.toStopId, 10);
  return {
    id,
    label: str(o.label),
    stopId,
    stopName: str(o.stopName),
    route,
    routeColor: str(o.routeColor, 9),
    destination: str(o.destination),
    time,
    days,
    walkMinutes: num(o.walkMinutes, 0, 60, 5),
    toStopId: toStopId && /^\d+$/.test(toStopId) ? toStopId : undefined,
    toStopName: str(o.toStopName),
    remind: o.remind === true,
    remindBefore: num(o.remindBefore, 0, 60, 5),
    createdAt: num(o.createdAt, 0, Number.MAX_SAFE_INTEGER, 0),
  };
}

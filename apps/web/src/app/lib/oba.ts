import axios from 'axios';
import type { Schedule } from '../types';
import { cached } from './cache';
import { addDays, formatClock, hhmmToSeconds, serviceTimeToEpoch, zonedDateString } from './time';

// Marprom's own real-time API ("OBA"), the same data the arrival boards at
// stops show. Undocumented but public JSON, no key. Errors come back as HTTP
// 200 with Response.Status -1, which also just means "nothing right now"
// (e.g. at night).
//
// Field meanings, from comparing responses (Nov 2026):
//   ArrivalTime  timetabled time at the stop (HH:MM)
//   ETAMin       minutes until the bus is there, as shown on the board
//   DelayMin     only present while the bus is tracked on this trip
//   BusCode      fleet number; also in GetActiveDeviceDetails

export const OBA_BASE_URL = 'https://vozniredi.marprom.si/OBA';
const USER_AGENT = 'MBus/1.0 (Next.js; https://github.com/digitaljerry/mbus)';
const TIMEOUT_MS = 4000;
const ARRIVALS_TTL_MS = 10 * 1000;
const VEHICLES_TTL_MS = 10 * 1000;
const LINES_TTL_MS = 6 * 60 * 60 * 1000;

interface ObaEnvelope {
  Response?: { Status?: number; Message?: string; Date?: string };
}

interface ObaArrival {
  Description?: string;
  LineId?: number;
  LineCode: string;
  LineDescription?: string;
  ArrivalTime: string;
  ETAMin: number;
  DelayMin?: number | null;
  BusCode?: string;
}

export interface ObaVehicle {
  DeviceId: number;
  BusCode: string;
  RouteId?: number;
  LineId: number;
  Lat: number;
  Lon: number;
  NextStopPointId?: number | null;
  ETA?: number | null;
  LKStopPointId?: number | null;
  Predicted?: number;
  DirectionDescription?: string;
  Direction?: number;
}

export interface ObaLine {
  LineId: number;
  Code: string;
  Description?: string;
  Color?: string;
  routes?: Array<{ RouteId: number; LineId: number; HeadsignName?: string }>;
}

// When Marprom is unreachable, skip it for a minute instead of waiting for
// timeouts on every request.
let downUntil = 0;

/** Calls one OBA method. Returns null when Marprom says there's no data. */
async function call<T extends ObaEnvelope>(method: string, params: Record<string, string> = {}): Promise<{ data: T; at: number } | null> {
  if (Date.now() < downUntil) throw new Error('OBA unavailable (cooling down)');
  try {
    const { data } = await axios.get<T>(`${OBA_BASE_URL}/${method}`, {
      params,
      timeout: TIMEOUT_MS,
      headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
    });
    if (!data || typeof data !== 'object' || !data.Response) throw new Error(`OBA ${method}: unexpected body`);
    if (data.Response.Status !== 1) return null;
    return { data, at: parseObaDate(data.Response.Date) ?? Date.now() };
  } catch (err) {
    const status = (err as { response?: { status?: number } }).response?.status;
    if (!status || status >= 500) downUntil = Date.now() + 60_000;
    throw err;
  }
}

/** "2026-11-05T11:46:35.4905438+01:00" (7 fraction digits) → epoch ms. */
function parseObaDate(s: string | undefined): number | null {
  if (!s) return null;
  const t = Date.parse(s.replace(/(\.\d{3})\d+/, '$1'));
  return Number.isFinite(t) ? t : null;
}

export interface LiveDeparture {
  route: string;
  schedule: Schedule;
  /** Epoch ms of the timetabled time this entry belongs to. */
  scheduledEpoch: number;
}

/** " G6 Vzpenjača              9 min" → "Vzpenjača". Board text, may be truncated. */
function destinationFrom(a: ObaArrival): string | undefined {
  const text = (a.Description ?? '').trim();
  const rest = text.startsWith(a.LineCode) ? text.slice(a.LineCode.length) : text;
  const dest = rest.replace(/\s+(\d+\s*min|\d{1,2}:\d{2}|prihod|odhod)\s*$/i, '').trim();
  return dest || undefined;
}

/** Epoch of HH:MM on whichever day puts it closest to `near`. */
function nearestClock(hhmm: string, near: number): number {
  const day = zonedDateString(new Date(near));
  const seconds = hhmmToSeconds(hhmm);
  return [-1, 0, 1]
    .map(d => serviceTimeToEpoch(addDays(day, d), seconds))
    .reduce((best, t) => (Math.abs(t - near) < Math.abs(best - near) ? t : best));
}

function toLive(a: ObaArrival, at: number): LiveDeparture | null {
  if (!a.LineCode || !/^\d{1,2}:\d{2}$/.test(a.ArrivalTime ?? '') || !Number.isFinite(a.ETAMin)) return null;
  const live = a.DelayMin !== undefined && a.DelayMin !== null;
  const eta = at + Math.max(0, a.ETAMin) * 60_000;
  const scheduledEpoch = nearestClock(a.ArrivalTime.padStart(5, '0'), eta - (live ? a.DelayMin! : 0) * 60_000);
  // Tracked buses: the board's countdown. Others: their timetabled time.
  const epoch = live ? eta : scheduledEpoch;
  return {
    route: a.LineCode,
    scheduledEpoch,
    schedule: {
      time: formatClock(epoch),
      epoch,
      scheduledTime: formatClock(scheduledEpoch),
      destination: destinationFrom(a),
      delay: live ? a.DelayMin! * 60 : undefined,
      realtime: live,
      busCode: a.BusCode || undefined,
    },
  };
}

/** Next buses at a stop, all lines (usually one or two per line and direction). */
export function fetchLiveArrivals(stopId: string): Promise<LiveDeparture[]> {
  return cached(`oba:arr:${stopId}`, ARRIVALS_TTL_MS, async () => {
    const res = await call<ObaEnvelope & { ArrivalsForStopPoints?: ObaArrival[] }>('GetArrivalsForStopPoint', { stopPointId: stopId });
    if (!res) return [];
    return (res.data.ArrivalsForStopPoints ?? []).map(a => toLive(a, res.at)).filter((x): x is LiveDeparture => x !== null);
  });
}

export function fetchActiveVehicles(): Promise<{ vehicles: ObaVehicle[]; at: number }> {
  return cached('oba:vehicles', VEHICLES_TTL_MS, async () => {
    const res = await call<ObaEnvelope & { Vehicles?: ObaVehicle[] }>('GetActiveDeviceDetails');
    return { vehicles: res?.data.Vehicles ?? [], at: res?.at ?? Date.now() };
  });
}

export function fetchLines(): Promise<ObaLine[]> {
  return cached('oba:lines', LINES_TTL_MS, async () => {
    const res = await call<ObaEnvelope & { Lines?: ObaLine[] }>('GetLines');
    const lines = res?.data.Lines ?? [];
    if (!lines.length) throw new Error('OBA GetLines: no lines');
    return lines;
  });
}

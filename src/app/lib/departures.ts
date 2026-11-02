import axios from 'axios';
import * as cheerio from 'cheerio';
import type { Schedule, ScheduleResponse } from '../types';
import { routeColor } from './routeColors';
// Bundled copy of Marprom's stop list (id, name, position), used when
// brezavta is unreachable.
import FALLBACK_STOPS from './marprom-stops.json';
import {
  addDays,
  formatClock,
  hhmmToSeconds,
  serviceTimeToEpoch,
  zonedDateString,
} from './time';

// Departure data from brezavta (live, GTFS based) with Marprom's printed
// timetable as fallback. Shared by the schedules, nearby and reminder code.

const DEBUG = process.env.NODE_ENV !== 'production' && process.env.DEBUG === '1';

const API_BASE_URL = 'https://api.beta.brezavta.si';
export const WEBSITE_BASE_URL = 'https://brezavta.si';
export const MARPROM_BASE_URL = 'https://vozniredi.marprom.si';
const USER_AGENT = 'MBus/1.0 (Next.js; https://github.com/digitaljerry/mbus)';

const LIVE_TTL_MS = 30 * 1000; // live arrivals change quickly
const TIMETABLE_TTL_MS = 30 * 60 * 1000; // printed timetables don't
const STOP_TTL_MS = 24 * 60 * 60 * 1000;
export const MAX_DEPARTURES = 5;
export const MAX_LIMIT = 80;
const EXACT_ARRIVALS = 8;
// A bus that left less than this long ago is still shown (as "departing").
const GRACE_MS = 30 * 1000;

const log = (...args: unknown[]) => {
  if (DEBUG) console.log('[schedules]', ...args);
};

interface BrezavtaArrival {
  route_short_name: string;
  route_color_background?: string;
  trip_id: string;
  trip_headsign: string;
  realtime: boolean;
  passed: boolean;
  arrival_scheduled: number;
  arrival_realtime: number;
  arrival_delay: number;
  departure_scheduled: number;
  departure_realtime: number;
}

interface StopInfo {
  name?: string;
  lat?: number;
  lon?: number;
}

interface TimetableRow {
  destination: string;
  times: string[];
}

// Caches promises, so concurrent requests for the same page share one fetch.
const cache = new Map<string, { expires: number; value: Promise<unknown> }>();

function cached<T>(key: string, ttl: number, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.value as Promise<T>;
  const value = load();
  cache.set(key, { expires: Date.now() + ttl, value });
  value.catch(() => {
    if (cache.get(key)?.value === value) cache.delete(key);
  });
  if (cache.size > 2000) {
    const now = Date.now();
    for (const [k, v] of cache) if (v.expires <= now) cache.delete(k);
  }
  return value;
}

// When brezavta fails, skip it for a minute instead of waiting for timeouts
// on every request.
let brezavtaDownUntil = 0;
const BREZAVTA_TIMEOUT_MS = 5000;
async function brezavta<T>(path: string, timeout = BREZAVTA_TIMEOUT_MS): Promise<T> {
  if (Date.now() < brezavtaDownUntil) throw new Error('brezavta unavailable (cooling down)');
  try {
    const { data } = await http.get<T>(`${API_BASE_URL}${path}`, { timeout, headers: { Accept: 'application/json' } });
    return data;
  } catch (err) {
    const status = (err as { response?: { status?: number } }).response?.status;
    if (!status || status >= 500) brezavtaDownUntil = Date.now() + 60_000;
    throw err;
  }
}

const http = axios.create({
  timeout: 10000,
  headers: { 'User-Agent': USER_AGENT },
});

export async function fetchStopInfo(stopId: string): Promise<StopInfo> {
  return cached(`stop:${stopId}`, STOP_TTL_MS, async () => {
    const fallback = FALLBACK_STOPS.find(s => s.id === stopId);
    try {
      const data = await brezavta<{ name?: string; lat?: number; lon?: number }>(`/stops/${encodeURIComponent(`MARPROM:${stopId}`)}`);
      return { name: data?.name ?? fallback?.name, lat: data?.lat ?? fallback?.lat, lon: data?.lon ?? fallback?.lon };
    } catch {
      return fallback ? { name: fallback.name, lat: fallback.lat, lon: fallback.lon } : {};
    }
  });
}

export async function fetchBrezavta(stopId: string): Promise<BrezavtaArrival[]> {
  return cached(`arr:${stopId}`, LIVE_TTL_MS, async () => {
    const data = await brezavta<BrezavtaArrival[]>(`/stops/${encodeURIComponent(`MARPROM:${stopId}`)}/arrivals`);
    return Array.isArray(data) ? data : [];
  });
}

/**
 * Scrape Marprom's official timetable page for one stop + date.
 * Structure: <div id="l-G6"></div> followed by a table whose rows hold
 * a direction (td.tdWidth) and a whitespace separated list of HH:MM times.
 */
export async function fetchMarpromTimetable(stopId: string, date: string): Promise<Record<string, TimetableRow[]>> {
  return cached(`mp:${stopId}:${date}`, TIMETABLE_TTL_MS, async () => {
    const url = `${MARPROM_BASE_URL}/?stop=${encodeURIComponent(stopId)}&datum=${date}`;
    const { data: html } = await http.get<string>(url, { responseType: 'text' });
    const $ = cheerio.load(html);
    const result: Record<string, TimetableRow[]> = {};

    $('div[id^="l-"]').each((_, el) => {
      const route = $(el).attr('id')!.slice(2);
      const table = $(el).nextAll('table').first();
      const rows: TimetableRow[] = [];
      table.find('tr').each((_, tr) => {
        const dirCell = $(tr).find('td.tdWidth');
        if (!dirCell.length) return;
        const times = (dirCell.next('td').text().match(/\b\d{1,2}:\d{2}\b/g) ?? []).map(t => t.padStart(5, '0'));
        if (times.length) rows.push({ destination: dirCell.text().trim(), times });
      });
      if (rows.length) result[route] = rows;
    });

    log('marprom', stopId, date, Object.keys(result));
    return result;
  });
}

function fromBrezavta(arrivals: BrezavtaArrival[], route: string, date: string, includePassed = false): Schedule[] {
  return arrivals
    .filter(a => a.route_short_name === route && (includePassed || !a.passed))
    .map(a => {
      const seconds = a.realtime ? a.arrival_realtime : a.arrival_scheduled;
      const epoch = serviceTimeToEpoch(date, seconds);
      return {
        time: formatClock(epoch),
        epoch,
        scheduledTime: formatClock(serviceTimeToEpoch(date, a.arrival_scheduled)),
        destination: a.trip_headsign || undefined,
        delay: a.realtime ? a.arrival_delay : undefined,
        realtime: a.realtime,
        tripId: a.trip_id,
      };
    });
}

function fromTimetable(rows: TimetableRow[] | undefined, date: string): Schedule[] {
  if (!rows) return [];
  return rows.flatMap(row =>
    row.times.map(t => {
      const epoch = serviceTimeToEpoch(date, hhmmToSeconds(t));
      return { time: t, scheduledTime: t, epoch, destination: row.destination, realtime: false };
    })
  );
}

export const upcoming = (list: Schedule[], now: number) =>
  list.filter(s => s.epoch > now - GRACE_MS).sort((a, b) => a.epoch - b.epoch);
// ---------------------------------------------------------------------------
// Stops

export interface StopListItem {
  id: string;
  name: string;
  lat: number;
  lon: number;
}

export async function fetchStopList(): Promise<StopListItem[]> {
  return cached('stops:all', STOP_TTL_MS, async () => {
    let data: Array<{ gtfs_id?: string; name?: string; lat: number; lon: number }>;
    try {
      data = await brezavta(`/stops/`, 15000);
    } catch {
      return FALLBACK_STOPS;
    }
    return data
      .filter(s => s.gtfs_id?.startsWith('MARPROM:') && s.name)
      .map(s => ({ id: s.gtfs_id!.slice('MARPROM:'.length), name: s.name!, lat: s.lat, lon: s.lon }))
      .sort((a, b) => a.name.localeCompare(b.name, 'sl'));
  });
}

/** Great-circle distance in metres. */
export function distanceM(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLon = toRad(bLon - aLon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// ---------------------------------------------------------------------------
// Departures for one stop + line

export interface RouteDeparturesOptions {
  now?: number;
  /** Skip live data (used to simulate other times in development). */
  timetableOnly?: boolean;
  limit?: number;
  /** Alighting stop: adds arrival estimates to each departure. */
  toStopId?: string;
  /** Also return up to this many departures that are already due (`earlier`). */
  before?: number;
}

export async function getRouteDepartures(
  stop: string,
  route: string,
  { now = Date.now(), timetableOnly = false, limit = MAX_DEPARTURES, toStopId, before = 0 }: RouteDeparturesOptions = {}
): Promise<{ payload: ScheduleResponse; failed: boolean }> {
  const today = zonedDateString(new Date(now));
  const stopInfoPromise = fetchStopInfo(stop);

  let schedules: Schedule[] = [];
  // Buses already due (newest last), so a late bus without live data and
  // earlier departures can still be looked up.
  let earlier: Schedule[] = [];
  const isEarlier = (s: Schedule) => s.epoch <= now - GRACE_MS;
  let source: ScheduleResponse['source'] = 'none';
  let liveColor: string | undefined;
  let note: string | undefined;
  const errors: string[] = [];

  // 1. Brezavta: real-time where available, but only knows trips that exist in
  //    Marprom's GTFS feed (which has had gaps in its weekday calendar).
  if (!timetableOnly) {
    try {
      const arrivals = await fetchBrezavta(stop);
      const forRoute = arrivals.find(a => a.route_short_name === route);
      if (forRoute?.route_color_background) liveColor = `#${forRoute.route_color_background.replace('#', '')}`;
      schedules = upcoming(fromBrezavta(arrivals, route, today), now);
      if (schedules.length) {
        source = 'brezavta';
        if (before > 0) {
          earlier = fromBrezavta(arrivals, route, today, true)
            .filter(s => isEarlier(s) || arrivals.some(a => a.trip_id === s.tripId && a.passed))
            .filter(s => !schedules.some(x => x.tripId === s.tripId))
            .sort((a, b) => a.epoch - b.epoch)
            .slice(-before);
        }
      }
    } catch (err) {
      errors.push('brezavta');
      log('brezavta failed', err);
    }
  }

  // 2. Marprom's printed timetable for today, then tomorrow if today is done.
  //    Both pages are requested at once (each is ~400 kB and slow).
  if (schedules.length < limit) {
    try {
      const tomorrowPage = fetchMarpromTimetable(stop, addDays(today, 1)).catch(() => ({}) as Record<string, TimetableRow[]>);
      const todayAll = fromTimetable((await fetchMarpromTimetable(stop, today))[route], today);
      const todayTable = upcoming(todayAll, now);
      if (!schedules.length && todayTable.length) {
        schedules = todayTable;
        source = 'marprom';
      }
      if (before > 0 && source !== 'brezavta') {
        earlier = todayAll.filter(isEarlier).sort((a, b) => a.epoch - b.epoch).slice(-before);
      }
      if (schedules.length < limit) {
        const tomorrow = addDays(today, 1);
        const tomorrowTable = fromTimetable((await tomorrowPage)[route], tomorrow);
        if (tomorrowTable.length) {
          if (!schedules.length) {
            note = 'No more buses today — showing tomorrow';
            source = 'marprom';
          }
          const lastEpoch = schedules.at(-1)?.epoch ?? 0;
          schedules = [...schedules, ...upcoming(tomorrowTable, Math.max(now, lastEpoch + 1))];
        }
      }
    } catch (err) {
      errors.push('marprom');
      log('marprom failed', err);
    }
  }

  schedules = schedules.slice(0, limit);
  let toStopName: string | undefined;
  if (toStopId && schedules.length) {
    try {
      toStopName = (await fetchStopInfo(toStopId)).name;
      schedules = await addArrivals(stop, route, toStopId, schedules);
      if (earlier.length) earlier = await addArrivals(stop, route, toStopId, earlier);
    } catch (err) {
      log('arrivals failed', err);
    }
  }

  const stopInfo = await stopInfoPromise;
  const payload: ScheduleResponse = {
    stop,
    stopName: stopInfo.name,
    lat: stopInfo.lat,
    lon: stopInfo.lon,
    route,
    routeColor: liveColor ?? routeColor(route),
    date: today,
    schedules,
    url: source === 'marprom' ? `${MARPROM_BASE_URL}/?stop=${stop}&datum=${today}` : `${WEBSITE_BASE_URL}/stop/MARPROM:${stop}`,
    source,
    note,
    toStop: toStopId,
    toStopName,
    limit,
    earlier: before > 0 ? earlier : undefined,
    fetchedAt: now,
  };
  return { payload, failed: !schedules.length && errors.length === (timetableOnly ? 1 : 2) };
}

// ---------------------------------------------------------------------------
// Arrival at a destination stop

interface TripStopTime {
  stop: { gtfs_id: string };
  sequence: number;
  realtime: boolean;
  arrival_scheduled: number;
  arrival_realtime: number;
  departure_scheduled: number;
  departure_realtime: number;
}

async function fetchTrip(tripId: string, date: string): Promise<TripStopTime[]> {
  return cached(`trip:${tripId}:${date}`, LIVE_TTL_MS, async () => {
    const data = await brezavta<{ stop_times?: TripStopTime[] }>(
      `/trips/${encodeURIComponent(tripId)}?date=${date.replaceAll('-', '')}`
    );
    return data?.stop_times ?? [];
  });
}

/** Seconds from boarding at `from` to arriving at `to`, from one trip's stop times. */
function travelSeconds(stopTimes: TripStopTime[], from: string, to: string): number | null {
  const a = stopTimes.find(s => s.stop.gtfs_id === `MARPROM:${from}`);
  const b = stopTimes.find(s => s.stop.gtfs_id === `MARPROM:${to}`);
  if (!a || !b || b.sequence <= a.sequence) return null;
  return b.arrival_scheduled - a.departure_scheduled;
}

/**
 * Typical travel time between two stops on a line, learned from any trip
 * brezavta knows today (the GTFS feed has trips even on days it lacks a full
 * timetable). Cached for a day.
 */
async function typicalTravelSeconds(from: string, route: string, to: string): Promise<number | null> {
  const key = `travel:${from}:${route}:${to}`;
  const result = await cached(key, STOP_TTL_MS, async () => {
    // 1. From a real trip, when brezavta has any today.
    const arrivals = (await fetchBrezavta(from).catch(() => [] as BrezavtaArrival[])).filter(a => a.route_short_name === route);
    const date = zonedDateString();
    for (const a of arrivals.slice(0, 4)) {
      const t = travelSeconds(await fetchTrip(a.trip_id, date).catch(() => []), from, to);
      if (t !== null) return t;
    }
    // 2. From the two printed timetables (weekdays, when the GTFS feed has gaps).
    return travelFromTimetables(from, route, to, date);
  });
  // Don't remember "unknown" for a day; try again next time.
  if (result === null) cache.delete(key);
  return result;
}

/**
 * Median travel time between two stops from Marprom's printed timetables:
 * each departure is paired with the first time at the destination that is at
 * least a plausible ride away (straight-line distance at ~25 km/h, ×0.7).
 */
async function travelFromTimetables(from: string, route: string, to: string, date: string): Promise<number | null> {
  const [a, b, fromPage, toPage] = await Promise.all([
    fetchStopInfo(from),
    fetchStopInfo(to),
    fetchMarpromTimetable(from, date),
    fetchMarpromTimetable(to, date),
  ]);
  if (a.lat === undefined || a.lon === undefined || b.lat === undefined || b.lon === undefined) return null;
  const minRide = ((distanceM(a.lat, a.lon, b.lat, b.lon) * 1.3) / 417) * 0.7 * 60; // seconds
  const toSec = (rows: TimetableRow[] | undefined) =>
    (rows ?? []).flatMap(r => r.times.map(hhmmToSeconds)).sort((x, y) => x - y);
  const origin = toSec(fromPage[route]);
  const dest = toSec(toPage[route]);
  if (!origin.length || !dest.length) return null;
  const diffs: number[] = [];
  for (const o of origin) {
    const d = dest.find(t => t >= o + minRide);
    if (d !== undefined && d - o <= 90 * 60) diffs.push(d - o);
  }
  if (diffs.length < 3) return null;
  diffs.sort((x, y) => x - y);
  return diffs[Math.floor(diffs.length / 2)];
}

async function addArrivals(from: string, route: string, to: string, schedules: Schedule[]): Promise<Schedule[]> {
  // Warm the destination's timetable pages while learning the travel time.
  const days = [...new Set(schedules.map(s => zonedDateString(new Date(s.epoch))))];
  days.forEach(day => fetchMarpromTimetable(to, day).catch(() => null));
  const typical = await typicalTravelSeconds(from, route, to).catch(() => null);
  // Timetable-only departures: arrival = first timetabled time at the
  // destination after (departure + ~80% of the typical travel time).
  let destTimes: number[] | null = null;
  const loadDestTimes = async () => {
    if (destTimes) return destTimes;
    const all: number[] = [];
    const pages = await Promise.all(days.map(day => fetchMarpromTimetable(to, day)));
    pages.forEach((page, i) =>
      (page[route] ?? []).forEach(r => r.times.forEach(t => all.push(serviceTimeToEpoch(days[i], hhmmToSeconds(t)))))
    );
    destTimes = all.sort((a, b) => a - b);
    return destTimes;
  };

  return Promise.all(
    schedules.map(async (s, index) => {
      // Exact: the trip's own stop times (with real-time if available).
      // Only for the first few, so long "show more" lists stay cheap.
      if (s.tripId && index < EXACT_ARRIVALS) {
        try {
          const date = zonedDateString(new Date(s.epoch - (s.delay ?? 0) * 1000));
          const st = await fetchTrip(s.tripId, date);
          const b = st.find(x => x.stop.gtfs_id === `MARPROM:${to}`);
          const a = st.find(x => x.stop.gtfs_id === `MARPROM:${from}`);
          if (a && b && b.sequence > a.sequence) {
            const epoch = serviceTimeToEpoch(date, b.realtime ? b.arrival_realtime : b.arrival_scheduled);
            return { ...s, arrivalEpoch: epoch, arrivalTime: formatClock(epoch) };
          }
        } catch {}
      }
      if (typical === null) return s;
      try {
        const times = await loadDestTimes();
        const earliest = s.epoch + typical * 800; // 80 % of typical, in ms
        const latest = s.epoch + typical * 1000 + 15 * 60_000;
        const hit = times.find(t => t >= earliest && t <= latest);
        const epoch = hit ?? s.epoch + typical * 1000;
        return { ...s, arrivalEpoch: epoch, arrivalTime: formatClock(epoch), arrivalEstimated: !hit };
      } catch {
        const epoch = s.epoch + typical * 1000;
        return { ...s, arrivalEpoch: epoch, arrivalTime: formatClock(epoch), arrivalEstimated: true };
      }
    })
  );
}

// ---------------------------------------------------------------------------
// Everything leaving a stop (all lines), for the Nearby view

export interface StopBoard {
  stop: string;
  stopName?: string;
  lat?: number;
  lon?: number;
  departures: Array<Schedule & { route: string; routeColor: string }>;
}

export async function getStopBoard(stop: string, { now = Date.now(), perRoute = 3 } = {}): Promise<StopBoard> {
  const today = zonedDateString(new Date(now));
  const tomorrow = addDays(today, 1);
  const [info, arrivals, timetable, timetableTomorrow] = await Promise.all([
    fetchStopInfo(stop),
    fetchBrezavta(stop).catch(() => [] as BrezavtaArrival[]),
    fetchMarpromTimetable(stop, today).catch(() => ({}) as Record<string, TimetableRow[]>),
    fetchMarpromTimetable(stop, tomorrow).catch(() => ({}) as Record<string, TimetableRow[]>),
  ]);
  const colors = new Map<string, string>();
  arrivals.forEach(a => a.route_color_background && colors.set(a.route_short_name, `#${a.route_color_background.replace('#', '')}`));
  const routes = new Set([...arrivals.map(a => a.route_short_name), ...Object.keys(timetable), ...Object.keys(timetableTomorrow)]);

  const departures: StopBoard['departures'] = [];
  for (const route of routes) {
    let list = upcoming(fromBrezavta(arrivals, route, today), now);
    if (!list.length) list = upcoming(fromTimetable(timetable[route], today), now);
    if (!list.length) list = upcoming(fromTimetable(timetableTomorrow[route], tomorrow), now);
    // Keep the next few per direction.
    const byDirection = new Map<string, Schedule[]>();
    list.forEach(s => {
      const k = s.destination ?? '';
      if (!byDirection.has(k)) byDirection.set(k, []);
      byDirection.get(k)!.push(s);
    });
    byDirection.forEach(l =>
      l.slice(0, perRoute).forEach(s => departures.push({ ...s, route, routeColor: colors.get(route) ?? routeColor(route) }))
    );
  }
  departures.sort((a, b) => a.epoch - b.epoch);
  return { stop, stopName: info.name, lat: info.lat, lon: info.lon, departures };
}

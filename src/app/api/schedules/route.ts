import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';
import * as cheerio from 'cheerio';
import type { Schedule, ScheduleResponse } from '../../types';
import { routeColor } from '../../lib/routeColors';
import {
  addDays,
  formatClock,
  hhmmToSeconds,
  serviceTimeToEpoch,
  zonedDateString,
} from '../../lib/time';

const DEBUG = process.env.NODE_ENV !== 'production' && process.env.DEBUG === '1';

const API_BASE_URL = 'https://api.beta.brezavta.si';
const WEBSITE_BASE_URL = 'https://brezavta.si';
const MARPROM_BASE_URL = 'https://vozniredi.marprom.si';
const USER_AGENT = 'MBus/1.0 (Next.js; https://github.com/digitaljerry/mbus)';

const LIVE_TTL_MS = 30 * 1000; // live arrivals change quickly
const TIMETABLE_TTL_MS = 30 * 60 * 1000; // printed timetables don't
const STOP_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_DEPARTURES = 5;
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

const cache = new Map<string, { expires: number; value: unknown }>();

async function cached<T>(key: string, ttl: number, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.value as T;
  const value = await load();
  cache.set(key, { expires: Date.now() + ttl, value });
  return value;
}

const http = axios.create({
  timeout: 10000,
  headers: { 'User-Agent': USER_AGENT },
});

async function fetchStopInfo(stopId: string): Promise<StopInfo> {
  return cached(`stop:${stopId}`, STOP_TTL_MS, async () => {
    try {
      const { data } = await http.get(`${API_BASE_URL}/stops/${encodeURIComponent(`MARPROM:${stopId}`)}`);
      return { name: data?.name, lat: data?.lat, lon: data?.lon };
    } catch {
      return {};
    }
  });
}

async function fetchBrezavta(stopId: string): Promise<BrezavtaArrival[]> {
  return cached(`arr:${stopId}`, LIVE_TTL_MS, async () => {
    const { data } = await http.get<BrezavtaArrival[]>(
      `${API_BASE_URL}/stops/${encodeURIComponent(`MARPROM:${stopId}`)}/arrivals`,
      { headers: { Accept: 'application/json' } }
    );
    return Array.isArray(data) ? data : [];
  });
}

/**
 * Scrape Marprom's official timetable page for one stop + date.
 * Structure: <div id="l-G6"></div> followed by a table whose rows hold
 * a direction (td.tdWidth) and a whitespace separated list of HH:MM times.
 */
async function fetchMarpromTimetable(stopId: string, date: string): Promise<Record<string, TimetableRow[]>> {
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

function fromBrezavta(arrivals: BrezavtaArrival[], route: string, date: string): Schedule[] {
  return arrivals
    .filter(a => a.route_short_name === route && !a.passed)
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

const upcoming = (list: Schedule[], now: number) =>
  list.filter(s => s.epoch > now - GRACE_MS).sort((a, b) => a.epoch - b.epoch);

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const stop = searchParams.get('stop')?.trim();
  const route = searchParams.get('route')?.trim().toUpperCase();

  if (!stop || !route || !/^\d+$/.test(stop) || !/^[A-Z0-9]+$/.test(route)) {
    return NextResponse.json({ error: 'Missing or invalid stop or route parameter' }, { status: 400 });
  }

  // Dev-only: ?at=<epoch ms> simulates another moment (e.g. a weekday).
  const at = process.env.NODE_ENV !== 'production' ? Number(searchParams.get('at')) : NaN;
  const simulated = Number.isFinite(at) && at > 0;
  const now = simulated ? at : Date.now();
  const today = zonedDateString(new Date(now));
  const stopInfoPromise = fetchStopInfo(stop);

  let schedules: Schedule[] = [];
  let source: ScheduleResponse['source'] = 'none';
  let liveColor: string | undefined;
  let note: string | undefined;
  const errors: string[] = [];

  // 1. Brezavta: real-time where available, but only knows trips that exist in
  //    Marprom's GTFS feed (which has had gaps in its weekday calendar).
  // (Skipped when simulating: live arrivals can't be shifted in time.)
  if (!simulated) try {
    const arrivals = await fetchBrezavta(stop);
    const forRoute = arrivals.find(a => a.route_short_name === route);
    if (forRoute?.route_color_background) liveColor = `#${forRoute.route_color_background.replace('#', '')}`;
    schedules = upcoming(fromBrezavta(arrivals, route, today), now);
    if (schedules.length) source = 'brezavta';
  } catch (err) {
    errors.push('brezavta');
    log('brezavta failed', err);
  }

  // 2. Marprom's printed timetable for today, then tomorrow if today is done.
  if (schedules.length < MAX_DEPARTURES) {
    try {
      const todayTable = upcoming(fromTimetable((await fetchMarpromTimetable(stop, today))[route], today), now);
      if (!schedules.length && todayTable.length) {
        schedules = todayTable;
        source = 'marprom';
      }
      if (schedules.length < MAX_DEPARTURES) {
        const tomorrow = addDays(today, 1);
        const tomorrowTable = fromTimetable((await fetchMarpromTimetable(stop, tomorrow))[route], tomorrow);
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

  const stopInfo = await stopInfoPromise;
  const payload: ScheduleResponse = {
    stop,
    stopName: stopInfo.name,
    lat: stopInfo.lat,
    lon: stopInfo.lon,
    route,
    routeColor: liveColor ?? routeColor(route),
    date: today,
    schedules: schedules.slice(0, MAX_DEPARTURES),
    url: source === 'marprom'
      ? `${MARPROM_BASE_URL}/?stop=${stop}&datum=${today}`
      : `${WEBSITE_BASE_URL}/stop/MARPROM:${stop}`,
    source,
    note,
    fetchedAt: now,
  };

  if (!schedules.length && errors.length === 2) {
    return NextResponse.json({ ...payload, note: 'Unable to reach timetable services' }, { status: 502 });
  }

  return NextResponse.json(payload, {
    headers: { 'Cache-Control': 'public, s-maxage=20, stale-while-revalidate=40' },
  });
}

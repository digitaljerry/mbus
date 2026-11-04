// Time helpers pinned to Maribor's time zone so server (UTC on Vercel)
// and client agree on what "today" and "now" mean.

export const TIME_ZONE = 'Europe/Ljubljana';

const partsFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

export function zonedParts(date: Date = new Date()): ZonedParts {
  const out: Record<string, number> = {};
  for (const p of partsFormatter.formatToParts(date)) {
    if (p.type !== 'literal') out[p.type] = Number(p.value);
  }
  return out as unknown as ZonedParts;
}

/** Offset of Ljubljana from UTC at the given instant, in ms. */
function offsetMs(date: Date): number {
  const p = zonedParts(date);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/** YYYY-MM-DD for the given instant in Ljubljana. */
export function zonedDateString(date: Date = new Date()): string {
  const p = zonedParts(date);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

/** Adds whole days to a YYYY-MM-DD string. */
export function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

/** Epoch ms of local midnight in Ljubljana for a YYYY-MM-DD date. */
export function zonedMidnight(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number);
  const guess = Date.UTC(y, m - 1, d);
  // Two passes handle the DST edge correctly.
  let ts = guess - offsetMs(new Date(guess));
  ts = guess - offsetMs(new Date(ts));
  return ts;
}

/** Epoch ms for "HH:MM" (may exceed 24h for after-midnight trips) on a service date. */
export function serviceTimeToEpoch(dateStr: string, secondsSinceMidnight: number): number {
  // GTFS service times are relative to "noon minus 12h", which equals local
  // midnight except on DST days; local midnight is close enough for a bus board.
  return zonedMidnight(dateStr) + secondsSinceMidnight * 1000;
}

export function hhmmToSeconds(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 3600 + m * 60;
}

export function formatClock(epochMs: number): string {
  const p = zonedParts(new Date(epochMs));
  return `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`;
}

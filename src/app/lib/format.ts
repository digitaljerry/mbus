import { zonedDateString } from './time';

export interface Countdown {
  /** Big label: "Now", "4", "1 h 05" … */
  value: string;
  /** Unit after the value: "min" or "" */
  unit: string;
  /** Accessible / short sentence form: "in 4 min" */
  label: string;
  urgent: boolean;
  departed: boolean;
}

export function countdown(epoch: number, now: number): Countdown {
  const diff = epoch - now;
  if (diff <= -30_000) return { value: 'Gone', unit: '', label: 'departed', urgent: false, departed: true };
  if (diff < 60_000) return { value: 'Now', unit: '', label: 'departing now', urgent: true, departed: false };
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return { value: String(mins), unit: 'min', label: `in ${mins} min`, urgent: mins <= 3, departed: false };
  const h = Math.floor(mins / 60);
  const m = String(mins % 60).padStart(2, '0');
  return { value: `${h} h ${m}`, unit: '', label: `in ${h} h ${m} min`, urgent: false, departed: false };
}

/** "tomorrow" / weekday name when a departure isn't today (Ljubljana time). */
export function dayLabel(epoch: number, now: number): string | undefined {
  const d = zonedDateString(new Date(epoch));
  const today = zonedDateString(new Date(now));
  if (d === today) return undefined;
  const tomorrow = zonedDateString(new Date(now + 24 * 3600 * 1000));
  if (d === tomorrow) return 'Tomorrow';
  return new Intl.DateTimeFormat('en-GB', { weekday: 'short', timeZone: 'Europe/Ljubljana' }).format(epoch);
}

export function delayInfo(delaySeconds?: number): { text: string; tone: 'ok' | 'warn' | 'late' } | null {
  if (delaySeconds === undefined || delaySeconds === null) return null;
  const mins = Math.round(delaySeconds / 60);
  if (mins <= 0) return { text: mins < 0 ? `${-mins} min early` : 'On time', tone: 'ok' };
  return { text: `+${mins} min`, tone: mins <= 3 ? 'warn' : 'late' };
}

export function ago(ts: number, now: number): string {
  if (!ts || !now) return '—';
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 5) return 'just now';
  if (s < 60) return `${s}s ago`;
  return `${Math.floor(s / 60)} min ago`;
}

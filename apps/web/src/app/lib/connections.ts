// Which lines serve a stop, and which lines run from one stop to another,
// from the static network (network.json, rebuilt with `npm run build:network`).

import NETWORK from './network.json';
import STOPS from './marprom-stops.json';
import { distanceM } from './departures';

/** Stops of the same name closer than this are one stop pair (both sides of the street). */
const SIBLING_M = 400;

const variants = NETWORK.lines.flatMap(l => l.variants.map(v => ({ route: l.route, headsign: v.headsign, stops: v.stops })));
const stopById = new Map(STOPS.map(s => [s.id, s]));

/** Lines that pick up at a stop (the last stop of a variant only drops off). */
const linesAt = new Map<string, string[]>();
for (const v of variants) {
  v.stops.slice(0, -1).forEach(id => {
    const list = linesAt.get(id) ?? [];
    if (!list.includes(v.route)) list.push(v.route);
    linesAt.set(id, list);
  });
}
const routeOrder = new Map(NETWORK.lines.map((l, i) => [l.route, i]));
linesAt.forEach(list => list.sort((a, b) => (routeOrder.get(a) ?? 99) - (routeOrder.get(b) ?? 99)));

export function linesAtStop(stopId: string): string[] {
  return linesAt.get(stopId) ?? [];
}

/** Lines with a trip that stops at `from` and later at `to`. */
export function linesBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (const v of variants) {
    const i = v.stops.indexOf(from);
    if (i === -1 || out.includes(v.route)) continue;
    if (v.stops.indexOf(to, i + 1) !== -1) out.push(v.route);
  }
  return out.sort((a, b) => (routeOrder.get(a) ?? 99) - (routeOrder.get(b) ?? 99));
}

/** The stop itself plus same-name stops nearby (the other side of the street). */
export function siblings(stopId: string): string[] {
  const s = stopById.get(stopId);
  if (!s) return [stopId];
  const others = STOPS.filter(o => o.id !== s.id && o.name === s.name && distanceM(s.lat, s.lon, o.lat, o.lon) <= SIBLING_M);
  return [s.id, ...others.map(o => o.id)];
}

export interface Connection {
  from: string;
  to: string;
  lines: string[];
}

/**
 * Lines from `from` to `to`. When none run, look at the stops across the
 * street: people often pick the right name but the wrong side.
 */
export function connections(from: string, to: string): { lines: string[]; alternatives: Connection[] } {
  const lines = linesBetween(from, to);
  if (lines.length) return { lines, alternatives: [] };
  const alternatives: Connection[] = [];
  for (const f of siblings(from)) {
    for (const t of siblings(to)) {
      if (f === from && t === to) continue;
      const l = linesBetween(f, t);
      if (l.length) alternatives.push({ from: f, to: t, lines: l });
    }
  }
  // Prefer changing only the boarding stop, then only the drop-off stop.
  const changes = (c: Connection) => Number(c.from !== from) + Number(c.to !== to);
  alternatives.sort((a, b) => changes(a) - changes(b) || Number(b.from === from) - Number(a.from === from));
  return { lines, alternatives };
}

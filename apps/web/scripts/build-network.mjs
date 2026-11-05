// Builds src/app/lib/network.json: every Marprom line with one shape and stop
// list per direction/variant, for the "All lines" map. Shapes rarely change,
// so this runs by hand (npm run build:network) and the result is committed.
//
// Source: brezavta (Marprom GTFS). We scan every stop's timetable on a few
// dates (weekend days in the current timetable + a summer weekday, because the
// feed lacks some weekday calendars) to find one trip per line + headsign.

import axios from 'axios';
import { writeFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, '../src/app/lib/network.json');
const STOPS = JSON.parse(readFileSync(join(here, '../src/app/lib/marprom-stops.json'), 'utf8'));
const API = 'https://api.beta.brezavta.si';
const DATES = (process.env.DATES ?? '20261107,20261108,20260715').split(',');
const http = axios.create({ timeout: 20000, headers: { 'User-Agent': 'MBus network builder (https://github.com/digitaljerry/mbus)', Accept: 'application/json' } });

async function get(path, tries = 3) {
  for (let i = 0; ; i++) {
    try {
      return (await http.get(API + path)).data;
    } catch (e) {
      if (i + 1 >= tries) throw e;
      await new Promise(r => setTimeout(r, 1000 * (i + 1)));
    }
  }
}

async function pool(items, n, fn) {
  const out = [];
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx], idx).catch(e => (console.error('  !', e.message), null));
    }
  }));
  return out;
}

// Douglas–Peucker on [lon, lat] points (tolerance in degrees, ~8 m).
function simplify(pts, tol = 0.00007) {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const [x1, y1] = pts[a], [x2, y2] = pts[b];
    const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1e-12;
    let max = 0, idx = -1;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs(dy * pts[i][0] - dx * pts[i][1] + x2 * y1 - y2 * x1) / len;
      if (d > max) { max = d; idx = i; }
    }
    if (max > tol && idx > 0) { keep[idx] = 1; stack.push([a, idx], [idx, b]); }
  }
  return pts.filter((_, i) => keep[i]).map(([x, y]) => [Math.round(x * 1e5) / 1e5, Math.round(y * 1e5) / 1e5]);
}

const variants = new Map(); // route|headsign -> { route, color, textColor, headsign, tripId, date, trips }
for (const date of DATES) {
  console.log(`Scanning ${STOPS.length} stops on ${date}…`);
  await pool(STOPS, 8, async stop => {
    const data = await get(`/stops/${encodeURIComponent('MARPROM:' + stop.id)}/schedule/${date}`);
    for (const r of data?.schedule ?? []) {
      const key = `${r.route_short_name}|${r.trip_headsign.replace(/\s+/g, ' ').trim()}`;
      const v = variants.get(key);
      if (!v) {
        variants.set(key, {
          route: r.route_short_name,
          color: r.route_color_background,
          textColor: r.route_color_text,
          headsign: r.trip_headsign.replace(/\s+/g, ' ').trim(),
          tripId: r.times[0]?.trip_id,
          date,
          trips: r.times.length,
        });
      } else {
        v.trips = Math.max(v.trips, r.times.length);
      }
    }
  });
}
console.log(`Found ${variants.size} line variants. Fetching shapes…`);

const list = [...variants.values()].filter(v => v.tripId);
const built = await pool(list, 6, async v => {
  const [trip, geom] = await Promise.all([get(`/trips/${encodeURIComponent(v.tripId)}?date=${v.date}`), get(`/trips/${encodeURIComponent(v.tripId)}/geometry`)]);
  const stops = (trip?.stop_times ?? []).map(st => st.stop.gtfs_id.replace('MARPROM:', ''));
  const shape = geom?.type === 'LineString' ? simplify(geom.coordinates) : [];
  return { ...v, stops, shape };
});

const lines = new Map();
for (const v of built.filter(Boolean)) {
  if (!v.shape.length) continue;
  if (!lines.has(v.route)) lines.set(v.route, { route: v.route, color: `#${v.color.replace('#', '')}`, textColor: `#${v.textColor.replace('#', '')}`, variants: [] });
  const line = lines.get(v.route);
  // Drop exact duplicates (same stops), keep the busiest headsign first.
  if (line.variants.some(x => x.stops.join() === v.stops.join())) continue;
  line.variants.push({ headsign: v.headsign, trips: v.trips, stops: v.stops, shape: v.shape });
}
const order = r => [r[0] === 'G' ? 0 : 1, Number(r.slice(1))];
const result = {
  generatedAt: new Date().toISOString(),
  source: 'brezavta.si (Marprom GTFS)',
  lines: [...lines.values()]
    .map(l => ({ ...l, variants: l.variants.sort((a, b) => b.trips - a.trips) }))
    .sort((a, b) => { const [x1, y1] = order(a.route), [x2, y2] = order(b.route); return x1 - x2 || y1 - y2; }),
};
writeFileSync(OUT, JSON.stringify(result));
console.log(`Wrote ${OUT}: ${result.lines.length} lines, ${result.lines.reduce((n, l) => n + l.variants.length, 0)} variants, ${(JSON.stringify(result).length / 1024).toFixed(0)} kB`);
console.log(result.lines.map(l => `${l.route}(${l.variants.length})`).join(' '));

import { NextResponse } from 'next/server';
import NETWORK from '../../lib/network.json';
import FALLBACK_STOPS from '../../lib/marprom-stops.json';
import type { NetworkResponse } from '../../lib/network';

// Every line's shape + stops (static, rebuilt with `npm run build:network`).
export async function GET() {
  const used = new Set(NETWORK.lines.flatMap(l => l.variants.flatMap(v => v.stops)));
  const stops: NetworkResponse['stops'] = {};
  for (const s of FALLBACK_STOPS) if (used.has(s.id)) stops[s.id] = [s.name, s.lat, s.lon];
  const body = { generatedAt: NETWORK.generatedAt, lines: NETWORK.lines, stops } as NetworkResponse;
  return NextResponse.json(body, {
    headers: { 'Cache-Control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800' },
  });
}

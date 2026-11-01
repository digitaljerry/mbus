import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';

const USER_AGENT = 'MBus/1.0 (Next.js; https://github.com/digitaljerry/mbus)';
const cache = new Map<string, unknown>();

// Route shape for a trip, used to draw the line on the map. Shapes rarely
// change, so they are cached for the lifetime of the server instance.
export async function GET(request: NextRequest) {
  const trip = new URL(request.url).searchParams.get('trip');
  if (!trip || !/^MARPROM:[\w-]+$/.test(trip)) {
    return NextResponse.json({ error: 'Invalid trip' }, { status: 400 });
  }
  try {
    if (!cache.has(trip)) {
      const { data } = await axios.get(
        `https://api.beta.brezavta.si/trips/${encodeURIComponent(trip)}/geometry`,
        { timeout: 10000, headers: { 'User-Agent': USER_AGENT } }
      );
      if (data?.type !== 'LineString') throw new Error('No geometry');
      cache.set(trip, data);
    }
    return NextResponse.json(cache.get(trip), {
      headers: { 'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800' },
    });
  } catch {
    return NextResponse.json({ error: 'Geometry unavailable' }, { status: 502 });
  }
}

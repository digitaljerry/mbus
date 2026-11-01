import { NextResponse } from 'next/server';
import axios from 'axios';

const USER_AGENT = 'MBus/1.0 (Next.js; https://github.com/digitaljerry/mbus)';
const TTL_MS = 24 * 60 * 60 * 1000;

export interface StopListItem {
  id: string;
  name: string;
  lat: number;
  lon: number;
}

let cache: { expires: number; stops: StopListItem[] } | null = null;

// All Marprom stops (id, name, position) for the stop picker and the map.
export async function GET() {
  try {
    if (!cache || cache.expires < Date.now()) {
      const { data } = await axios.get<Array<{ gtfs_id?: string; name?: string; lat: number; lon: number }>>(
        'https://api.beta.brezavta.si/stops/',
        { timeout: 15000, headers: { Accept: 'application/json', 'User-Agent': USER_AGENT } }
      );
      const stops = data
        .filter(s => s.gtfs_id?.startsWith('MARPROM:') && s.name)
        .map(s => ({ id: s.gtfs_id!.slice('MARPROM:'.length), name: s.name!, lat: s.lat, lon: s.lon }))
        .sort((a, b) => a.name.localeCompare(b.name, 'sl'));
      cache = { expires: Date.now() + TTL_MS, stops };
    }
    return NextResponse.json(
      { stops: cache.stops },
      { headers: { 'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800' } }
    );
  } catch {
    return NextResponse.json({ stops: [], error: 'Stop list unavailable' }, { status: 502 });
  }
}

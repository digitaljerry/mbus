import { NextResponse } from 'next/server';
import { fetchStopList } from '../../lib/departures';

// All Marprom stops (id, name, position) for the stop picker and the map.
export async function GET() {
  try {
    const stops = await fetchStopList();
    return NextResponse.json(
      { stops },
      { headers: { 'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800' } }
    );
  } catch {
    return NextResponse.json({ stops: [], error: 'Stop list unavailable' }, { status: 502 });
  }
}

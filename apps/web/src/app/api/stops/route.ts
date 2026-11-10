import { NextResponse } from 'next/server';
import { fetchStopList } from '../../lib/departures';
import { linesAtStop } from '../../lib/connections';

// All Marprom stops (id, sign code, name, position, lines that pick up
// there) for the stop picker and the map.
export async function GET() {
  try {
    const stops = (await fetchStopList()).map(s => ({ ...s, lines: linesAtStop(s.id) }));
    return NextResponse.json(
      { stops },
      { headers: { 'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800' } }
    );
  } catch {
    return NextResponse.json({ stops: [], error: 'Stop list unavailable' }, { status: 502 });
  }
}

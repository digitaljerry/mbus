import { NextRequest, NextResponse } from 'next/server';
import { distanceM, fetchStopList, getStopBoard } from '../../lib/departures';

const MAX_STOPS = 8;
const DEFAULT_RADIUS_M = 600;
const WALK_M_PER_MIN = 75; // ~4.5 km/h, a little slower for crossings

// Stops near a position, each with its next departures on every line.
export async function GET(request: NextRequest) {
  const sp = new URL(request.url).searchParams;
  const lat = Number(sp.get('lat'));
  const lon = Number(sp.get('lon'));
  const radius = Math.min(Number(sp.get('radius')) || DEFAULT_RADIUS_M, 2000);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    return NextResponse.json({ error: 'Invalid lat/lon' }, { status: 400 });
  }

  try {
    const all = await fetchStopList();
    const ranked = all
      .map(s => ({ ...s, distance: distanceM(lat, lon, s.lat, s.lon) }))
      .sort((a, b) => a.distance - b.distance);
    // Always return something: within the radius, or the closest few.
    let near = ranked.filter(s => s.distance <= radius).slice(0, MAX_STOPS);
    if (near.length === 0) near = ranked.slice(0, 3);

    const boards = await Promise.all(
      near.map(async s => {
        const board = await getStopBoard(s.id).catch(() => ({ stop: s.id, departures: [] }));
        // Straight-line distance × 1.3 for streets.
        const walkMinutes = Math.max(1, Math.round((s.distance * 1.3) / WALK_M_PER_MIN));
        return { ...board, stopName: s.name, lat: s.lat, lon: s.lon, distance: Math.round(s.distance), walkMinutes };
      })
    );
    return NextResponse.json({ stops: boards, fetchedAt: Date.now() }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ stops: [], error: 'Nearby stops unavailable' }, { status: 502 });
  }
}

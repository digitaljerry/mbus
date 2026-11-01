import { NextRequest, NextResponse } from 'next/server';
import { getRouteDepartures } from '../../lib/departures';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const stop = searchParams.get('stop')?.trim();
  const route = searchParams.get('route')?.trim().toUpperCase();
  const to = searchParams.get('to')?.trim() || undefined;

  if (!stop || !route || !/^\d+$/.test(stop) || !/^[A-Z0-9]+$/.test(route) || (to && !/^\d+$/.test(to))) {
    return NextResponse.json({ error: 'Missing or invalid stop, route or to parameter' }, { status: 400 });
  }

  // Dev-only: ?at=<epoch ms> simulates another moment (timetable data only,
  // since live arrivals can't be shifted in time).
  const at = process.env.NODE_ENV !== 'production' ? Number(searchParams.get('at')) : NaN;
  const simulated = Number.isFinite(at) && at > 0;

  const { payload, failed } = await getRouteDepartures(stop, route, {
    now: simulated ? at : Date.now(),
    timetableOnly: simulated,
    toStopId: to,
  });

  if (failed) {
    return NextResponse.json({ ...payload, note: 'Unable to reach timetable services' }, { status: 502 });
  }
  return NextResponse.json(payload, {
    headers: { 'Cache-Control': 'public, s-maxage=20, stale-while-revalidate=40' },
  });
}

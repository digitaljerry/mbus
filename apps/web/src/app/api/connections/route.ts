import { NextRequest, NextResponse } from 'next/server';
import { connections } from '../../lib/connections';

// Lines from one stop to another, with suggestions from the stop across the
// street when none run (e.g. ?from=659&to=347 → board at 656 instead).
export async function GET(request: NextRequest) {
  const sp = new URL(request.url).searchParams;
  const from = sp.get('from')?.trim();
  const to = sp.get('to')?.trim();
  if (!from || !to || !/^\d+$/.test(from) || !/^\d+$/.test(to)) {
    return NextResponse.json({ error: 'from and to stop ids are required' }, { status: 400 });
  }
  return NextResponse.json(connections(from, to), {
    headers: { 'Cache-Control': 'public, max-age=3600, s-maxage=86400' },
  });
}

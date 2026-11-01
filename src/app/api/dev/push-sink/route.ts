import { NextRequest, NextResponse } from 'next/server';
import { appendFile } from 'node:fs/promises';

// Development only: a stand-in push service endpoint for testing reminders
// end to end without a browser. Records each delivery (encrypted payload size).
export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV === 'production') return new NextResponse(null, { status: 404 });
  const body = await request.arrayBuffer();
  const line = JSON.stringify({ at: new Date().toISOString(), bytes: body.byteLength, ttl: request.headers.get('ttl'), urgency: request.headers.get('urgency') });
  await appendFile('/tmp/mbus-push-sink.log', line + '\n');
  return new NextResponse(null, { status: 201 });
}

import { NextRequest, NextResponse } from 'next/server';
import { isPushSubscription, pushEnabled, sendPush } from '../../../lib/pushServer';

// Sends one notification right away so you can check reminders work on this device.
export async function POST(request: NextRequest) {
  if (!pushEnabled()) return NextResponse.json({ error: 'Push is not configured' }, { status: 503 });
  const body = await request.json().catch(() => null);
  if (!isPushSubscription(body?.subscription)) return NextResponse.json({ error: 'Invalid subscription' }, { status: 400 });
  try {
    const status = await sendPush(body.subscription, {
      title: '🚌 MBus reminders are on',
      body: "You'll get a notification before it's time to leave for your usual bus.",
      tag: 'mbus-test',
      url: '/',
    });
    return NextResponse.json({ status });
  } catch {
    return NextResponse.json({ error: 'Push service rejected the message' }, { status: 502 });
  }
}

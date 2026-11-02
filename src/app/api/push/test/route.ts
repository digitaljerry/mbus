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
  } catch (err) {
    // web-push validation / push-service errors don't contain key material.
    const e = err as { message?: string; statusCode?: number; body?: string };
    console.error('[push/test] failed', e.statusCode, e.message, e.body);
    return NextResponse.json(
      { error: 'Push failed', reason: e.message?.slice(0, 200), statusCode: e.statusCode, body: e.body?.slice(0, 200) },
      { status: 502 }
    );
  }
}

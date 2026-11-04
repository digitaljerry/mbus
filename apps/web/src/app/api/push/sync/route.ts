import { NextRequest, NextResponse } from 'next/server';
import { resumeHook, start } from 'workflow/api';
import { cleanUsualBus, type UsualBus } from '../../../lib/usual';
import { isPushSubscription, pushEnabled, subscriptionId } from '../../../lib/pushServer';
import { reminderHookToken, reminderScheduler, type ReminderMessage } from '../../../../workflows/reminders';

const MAX_REMINDERS = 20;

// Hand this device's reminders to its scheduler workflow: update it if it's
// running, start it if not, stop it if no reminders are left.
export async function POST(request: NextRequest) {
  if (!pushEnabled()) return NextResponse.json({ error: 'Push is not configured' }, { status: 503 });

  const body = await request.json().catch(() => null);
  const subscription = body?.subscription;
  if (!isPushSubscription(subscription)) return NextResponse.json({ error: 'Invalid subscription' }, { status: 400 });
  const reminders = (Array.isArray(body?.reminders) ? body.reminders : [])
    .map(cleanUsualBus)
    .filter((u: UsualBus | null): u is UsualBus => Boolean(u?.remind && u.days.length))
    .slice(0, MAX_REMINDERS);

  const subId = subscriptionId(subscription);
  const token = reminderHookToken(subId);

  if (reminders.length === 0) {
    await resumeHook<ReminderMessage>(token, { type: 'stop' }).catch(() => null);
    return NextResponse.json({ status: 'stopped' });
  }

  try {
    await resumeHook<ReminderMessage>(token, { type: 'sync', subscription, reminders });
    return NextResponse.json({ status: 'updated', reminders: reminders.length });
  } catch {
    const run = await start(reminderScheduler, [subId, subscription, reminders]);
    return NextResponse.json({ status: 'started', runId: run.runId, reminders: reminders.length });
  }
}

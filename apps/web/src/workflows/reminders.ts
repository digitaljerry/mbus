import { createHook, sleep } from 'workflow';
import type { PushSubscription } from 'web-push';
import { getRouteDepartures } from '../app/lib/departures';
import { formatClock, zonedDateString } from '../app/lib/time';
import { nextOccurrences, occurrenceOn, type UsualBus } from '../app/lib/usual';
import { sendPush } from '../app/lib/pushServer';

// One long-running workflow per device (push subscription). It sleeps until
// the next reminder is due, checks the live departure, sends a Web Push, and
// repeats. The app updates or stops it through a hook keyed by the device.

export type ReminderMessage =
  | { type: 'sync'; subscription: PushSubscription; reminders: UsualBus[] }
  | { type: 'stop' };

interface Plan {
  at: number;
  key: string;
  reminderId: string;
  date: string;
}

export const reminderHookToken = (subId: string) => `mbus-reminders:${subId}`;

// Bounded so a single run's history stays small; the app restarts the
// scheduler whenever it syncs and finds it gone.
const MAX_REMINDERS_PER_RUN = 250;

export async function reminderScheduler(subId: string, subscription: PushSubscription, reminders: UsualBus[]) {
  'use workflow';

  using hook = createHook<ReminderMessage>({ token: reminderHookToken(subId) });
  const conflict = await hook.getConflict();
  if (conflict) return { status: 'duplicate' as const };

  let state = { subscription, reminders };
  let sent: string[] = [];
  let postponed: Plan | null = null;
  const messages = hook[Symbol.asyncIterator]();
  let nextMessage = messages.next();

  for (let i = 0; i < MAX_REMINDERS_PER_RUN; ) {
    const plan = await planNextReminder(state.reminders, sent, postponed);
    const wake = plan
      ? sleep(new Date(plan.at)).then(() => 'due' as const)
      : sleep('14 days').then(() => 'idle' as const);
    const event = await Promise.race([nextMessage.then(m => ({ m })), wake.then(w => ({ w }))]);

    if ('m' in event) {
      if (event.m.done || event.m.value.type === 'stop') return { status: 'stopped' as const };
      state = { subscription: event.m.value.subscription, reminders: event.m.value.reminders };
      postponed = null;
      nextMessage = messages.next();
      continue;
    }
    if (event.w === 'idle' || !plan) return { status: 'idle' as const };

    const reminder = state.reminders.find(r => r.id === plan.reminderId);
    if (!reminder) continue;
    const result = await deliverReminder(state.subscription, reminder, plan);
    if (result.status === 'gone') return { status: 'unsubscribed' as const };
    if (result.status === 'later') {
      postponed = { ...plan, at: result.at };
      continue;
    }
    postponed = null;
    sent = [...sent, plan.key].slice(-60);
    i++;
  }
  return { status: 'rotated' as const };
}

async function planNextReminder(reminders: UsualBus[], sent: string[], postponed: Plan | null): Promise<Plan | null> {
  'use step';
  const now = Date.now();
  if (postponed && !sent.includes(postponed.key)) return postponed;
  let best: Plan | null = null;
  for (const r of reminders) {
    if (!r.remind) continue;
    // Look a little into the past so a reminder due "just now" still fires.
    for (const occ of nextOccurrences(r, now - 2 * 60_000, 3)) {
      if (sent.includes(occ.key) || occ.notifyEpoch < now - 2 * 60_000) continue;
      const at = Math.max(occ.notifyEpoch, now);
      if (!best || at < best.at) best = { at, key: occ.key, reminderId: r.id, date: occ.date };
      break;
    }
  }
  return best;
}

async function deliverReminder(
  subscription: PushSubscription,
  r: UsualBus,
  plan: Plan
): Promise<{ status: 'sent' | 'gone' } | { status: 'later'; at: number }> {
  'use step';
  const occ = occurrenceOn(r, plan.date);
  let departEpoch = occ.departEpoch;
  let delayMin = 0;
  let realtime = false;
  let arrival: string | undefined;

  try {
    const { payload } = await getRouteDepartures(r.stopId, r.route, { limit: 12, toStopId: r.toStopId });
    const match = payload.schedules.find(
      s => s.scheduledTime === r.time && zonedDateString(new Date(s.epoch - (s.delay ?? 0) * 1000)) === plan.date
    );
    if (match) {
      departEpoch = match.epoch;
      realtime = Boolean(match.realtime);
      delayMin = Math.round((match.delay ?? 0) / 60);
      arrival = match.arrivalTime;
    }
  } catch {
    // No live data: fall back to the timetable.
  }

  // A late bus moves the reminder later (if it's still a while away).
  const notifyAt = departEpoch - (r.walkMinutes + r.remindBefore) * 60_000;
  if (notifyAt - Date.now() > 90_000) return { status: 'later', at: notifyAt };

  const leaveIn = Math.round((departEpoch - r.walkMinutes * 60_000 - Date.now()) / 60_000);
  const lead = leaveIn > 0 ? `Leave in ${leaveIn} min` : 'Leave now';
  const delay = realtime ? (delayMin > 0 ? ` (+${delayMin} min late)` : ' (on time)') : '';
  const parts = [
    `${r.route}${r.destination ? ` to ${r.destination}` : ''} leaves ${r.stopName ?? 'your stop'} at ${formatClock(departEpoch)}${delay}.`,
    r.walkMinutes ? `${r.walkMinutes} min walk.` : '',
    arrival ? `Arrives ${arrival}${r.toStopName ? ` at ${r.toStopName}` : ''}.` : '',
  ];
  const status = await sendPush(subscription, {
    title: `🚌 ${lead} · ${r.label || `${r.route} ${r.time}`}`,
    body: parts.filter(Boolean).join(' '),
    tag: plan.key,
    url: `/?usual=${encodeURIComponent(r.id)}`,
    timestamp: Date.now(),
  });
  return { status };
}

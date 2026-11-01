'use client';

import { Bell, BellOff, Footprints, LocateFixed, Star, Timer, LayoutList } from 'lucide-react';
import type { ScheduleResponse } from '../types';
import type { UsualBus } from '../lib/usual';
import type { PushState } from '../hooks/usePush';
import UsualSection from './UsualSection';
import type { Departure } from './JourneyCard';

interface Props {
  usual: UsualBus[];
  data: Record<string, ScheduleResponse>;
  now: number;
  push: PushState;
  onEnablePush: () => Promise<boolean>;
  onOpen: (u: UsualBus, d: Departure) => void;
  onEdit: (u: UsualBus) => void;
  onBrowseJourneys: () => void;
  onBrowseNearby: () => void;
}

const pushUnavailable: Record<string, string> = {
  'ios-needs-install': 'On iPhone, add MBus to your Home Screen (Share → Add to Home Screen) and open it from there to get reminders.',
  unsupported: "This browser can't show notifications, so reminders won't work here.",
  'server-disabled': "Reminders aren't set up on this server yet.",
};

function HowToAdd() {
  return (
    <ol className="space-y-2 text-sm text-ink-2">
      <li className="flex gap-2">
        <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-surface-2 text-xs font-semibold">1</span>
        Tap any departure, in a journey or under Nearby.
      </li>
      <li className="flex gap-2">
        <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-surface-2 text-xs font-semibold">2</span>
        <span>
          Choose <span className="font-medium text-ink">Make this my usual bus</span>.
        </span>
      </li>
      <li className="flex gap-2">
        <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-surface-2 text-xs font-semibold">3</span>
        Pick the days you take it and how long you walk to the stop.
      </li>
    </ol>
  );
}

export default function UsualView({ usual, data, now, push, onEnablePush, onOpen, onEdit, onBrowseJourneys, onBrowseNearby }: Props) {
  if (usual.length === 0) {
    return (
      <div className="rounded-2xl border border-line bg-surface p-6 shadow-card sm:p-8">
        <span className="flex size-12 items-center justify-center rounded-2xl bg-warn/15">
          <Star className="size-6 fill-current text-warn" aria-hidden />
        </span>
        <h2 className="mt-4 text-lg font-semibold">No usual buses yet</h2>
        <p className="mt-1 text-sm leading-relaxed text-ink-2">
          A usual bus is one you catch regularly, like the <span className="font-medium text-ink">07:41 G6 from Pohorska on weekdays</span>.
          Save it once and MBus will:
        </p>
        <ul className="mt-4 space-y-3 text-sm text-ink-2">
          <li className="flex gap-3">
            <Footprints className="mt-0.5 size-4 shrink-0 text-ink-3" aria-hidden />
            <span>
              <span className="font-medium text-ink">Tell you when to leave</span>, based on your walk to the stop and any delay.
            </span>
          </li>
          <li className="flex gap-3">
            <Timer className="mt-0.5 size-4 shrink-0 text-ink-3" aria-hidden />
            <span>
              <span className="font-medium text-ink">Count down to it</span> here and at the top of All journeys, live when real-time data exists.
            </span>
          </li>
          <li className="flex gap-3">
            <Bell className="mt-0.5 size-4 shrink-0 text-ink-3" aria-hidden />
            <span>
              <span className="font-medium text-ink">Remind you</span> with a notification before it&apos;s time to go (optional).
            </span>
          </li>
        </ul>
        <div className="mt-6 rounded-xl bg-surface-2/60 p-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-3">How to add one</p>
          <HowToAdd />
        </div>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row">
          <button
            onClick={onBrowseJourneys}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-accent px-4 py-3 font-semibold text-accent-ink"
          >
            <LayoutList className="size-4" aria-hidden /> Pick from my journeys
          </button>
          <button
            onClick={onBrowseNearby}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-surface-2 px-4 py-3 font-semibold text-ink-2"
          >
            <LocateFixed className="size-4" aria-hidden /> Find a stop nearby
          </button>
        </div>
      </div>
    );
  }

  const withReminders = usual.filter(u => u.remind).length;

  return (
    <div className="space-y-4">
      <UsualSection usual={usual} data={data} now={now} onOpen={onOpen} onEdit={onEdit} />

      <div className="rounded-2xl border border-line bg-surface p-4 shadow-card">
        <div className="flex items-start gap-3">
          {push.status === 'on' ? (
            <Bell className="mt-0.5 size-5 shrink-0 text-accent" aria-hidden />
          ) : (
            <BellOff className="mt-0.5 size-5 shrink-0 text-ink-3" aria-hidden />
          )}
          <div className="min-w-0 flex-1 text-sm">
            <p className="font-medium">Reminders</p>
            {push.status === 'loading' && <p className="text-ink-3">Checking…</p>}
            {push.status === 'on' && (
              <p className="text-ink-2">
                {withReminders === 0
                  ? 'Notifications are on. Tap ✎ on a bus and turn on "Remind me".'
                  : `On for ${withReminders} of ${usual.length} usual bus${usual.length === 1 ? '' : 'es'}. Tap ✎ to change.`}
              </p>
            )}
            {push.status === 'off' && (
              <>
                <p className="text-ink-2">Get a notification before it&apos;s time to leave.</p>
                <button onClick={onEnablePush} className="mt-2 rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-accent-ink">
                  Turn on notifications
                </button>
              </>
            )}
            {push.status === 'denied' && (
              <p className="text-ink-2">Notifications are blocked for MBus. Allow them in your browser or phone settings.</p>
            )}
            {push.status === 'unavailable' && <p className="text-ink-2">{pushUnavailable[push.reason]}</p>}
          </div>
        </div>
      </div>

      <details className="rounded-2xl border border-line bg-surface p-4 shadow-card">
        <summary className="cursor-pointer text-sm font-medium">Add another usual bus</summary>
        <div className="mt-3">
          <HowToAdd />
        </div>
      </details>
    </div>
  );
}

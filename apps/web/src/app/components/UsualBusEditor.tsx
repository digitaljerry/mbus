'use client';

import { useEffect, useMemo, useState } from 'react';
import { Bell, BellOff, Minus, Plus, Trash2, X } from 'lucide-react';
import type { UsualBus } from '../lib/usual';
import { DAY_NAMES, describeDays, nextOccurrences } from '../lib/usual';
import { formatClock } from '../lib/time';
import { dayLabel } from '../lib/format';
import { routeColor } from '../lib/routeColors';
import type { PushState } from '../hooks/usePush';
import RouteBadge from './RouteBadge';
import { loadStopList, StopPicker, type StopListItem } from './BusStopManager';

interface Props {
  initial: UsualBus;
  isNew: boolean;
  push: PushState;
  onEnablePush: () => Promise<boolean>;
  onTestPush: () => Promise<boolean>;
  onSave: (u: UsualBus) => void;
  onDelete?: () => void;
  onClose: () => void;
}

const REMIND_OPTIONS = [0, 2, 5, 10, 15];

const pushHelp: Record<string, string> = {
  'ios-needs-install': 'On iPhone, add MBus to your Home Screen first (Share → Add to Home Screen), then open it from there to turn on reminders.',
  unsupported: "This browser can't receive notifications.",
  'server-disabled': "Reminders aren't set up on this server yet.",
};

export default function UsualBusEditor({ initial, isNew, push, onEnablePush, onTestPush, onSave, onDelete, onClose }: Props) {
  const [u, setU] = useState<UsualBus>(initial);
  const [stopList, setStopList] = useState<StopListItem[]>([]);
  const [testState, setTestState] = useState<'idle' | 'sending' | 'sent' | 'failed'>('idle');

  useEffect(() => {
    loadStopList().then(setStopList);
  }, []);
  useEffect(() => {
    // The stop picker prevents Escape when it only closes its result list.
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !e.defaultPrevented && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const toStopName = useMemo(() => stopList.find(s => s.id === u.toStopId)?.name, [stopList, u.toStopId]);
  const next = nextOccurrences(u, Date.now())[0];
  const toggleDay = (d: number) =>
    setU({ ...u, days: u.days.includes(d) ? u.days.filter(x => x !== d) : [...u.days, d].sort() });

  const save = () => onSave({ ...u, label: u.label?.trim() || undefined, toStopName: u.toStopId ? toStopName ?? u.toStopName : undefined });

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="usual-title"
        className="relative flex max-h-[92dvh] w-full flex-col rounded-t-3xl bg-surface shadow-2xl sm:max-w-lg sm:rounded-3xl"
      >
        <div className="mx-auto mt-2 h-1.5 w-10 rounded-full bg-line sm:hidden" aria-hidden />
        <header className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
          <div className="flex min-w-0 items-center gap-2">
            <RouteBadge route={u.route} color={routeColor(u.route, u.routeColor)} size="md" />
            <h2 id="usual-title" className="truncate text-lg font-semibold">
              {isNew ? 'Make this your usual bus' : 'Usual bus'}
            </h2>
          </div>
          <button onClick={onClose} className="rounded-full p-2 text-ink-3 hover:bg-surface-2 hover:text-ink" aria-label="Close">
            <X className="size-5" />
          </button>
        </header>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
          <p className="text-sm text-ink-2">
            <span className="font-semibold text-ink tabular">{u.time}</span> from {u.stopName ?? `stop ${u.stopId}`}
            {u.destination && <> towards {u.destination}</>}
          </p>

          <label className="block">
            <span className="text-sm font-medium">Name</span>
            <span className="ml-2 text-xs text-ink-3">optional</span>
            <input
              value={u.label ?? ''}
              onChange={e => setU({ ...u, label: e.target.value })}
              placeholder="e.g. School run"
              className="input mt-1.5"
            />
          </label>

          <div>
            <p className="text-sm font-medium">Days</p>
            <div className="mt-1.5 grid grid-cols-7 gap-1.5">
              {DAY_NAMES.map((name, i) => {
                const d = i + 1;
                const on = u.days.includes(d);
                return (
                  <button
                    key={d}
                    onClick={() => toggleDay(d)}
                    aria-pressed={on}
                    className={`rounded-lg py-2 text-sm font-medium ${on ? 'bg-ink text-bg' : 'bg-surface-2 text-ink-2'}`}
                  >
                    {name.slice(0, 2)}
                  </button>
                );
              })}
            </div>
            <p className="mt-1.5 text-xs text-ink-3">{u.days.length ? describeDays(u.days) : 'Pick at least one day'}</p>
          </div>

          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium">Walk to the stop</p>
              <p className="text-xs text-ink-3">We work out when you need to leave.</p>
            </div>
            <div className="flex items-center gap-1 rounded-xl bg-surface-2 p-1">
              <button aria-label="Less" onClick={() => setU({ ...u, walkMinutes: Math.max(0, u.walkMinutes - 1) })} className="rounded-lg p-2 hover:bg-surface">
                <Minus className="size-4" />
              </button>
              <span className="w-14 text-center text-sm font-semibold tabular">{u.walkMinutes} min</span>
              <button aria-label="More" onClick={() => setU({ ...u, walkMinutes: Math.min(60, u.walkMinutes + 1) })} className="rounded-lg p-2 hover:bg-surface">
                <Plus className="size-4" />
              </button>
            </div>
          </div>

          <StopPicker
            label="Get off at (optional, for arrival times)"
            value={u.toStopId ?? ''}
            name={toStopName ?? u.toStopName}
            stopList={stopList}
            onChange={id => setU({ ...u, toStopId: id || undefined })}
            clearable
          />

          <div className="rounded-2xl border border-line p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                {u.remind ? <Bell className="size-5 text-accent" /> : <BellOff className="size-5 text-ink-3" />}
                <div>
                  <p className="text-sm font-medium">Remind me</p>
                  <p className="text-xs text-ink-3">A notification before it&apos;s time to leave. Late buses move it later.</p>
                </div>
              </div>
              <button
                role="switch"
                aria-checked={u.remind}
                onClick={async () => {
                  if (!u.remind && push.status === 'off') {
                    const ok = await onEnablePush();
                    if (!ok) return;
                  }
                  setU({ ...u, remind: !u.remind });
                }}
                disabled={!u.remind && (push.status === 'unavailable' || push.status === 'denied')}
                className={`relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-40 ${u.remind ? 'bg-accent' : 'bg-line'}`}
              >
                <span className={`absolute top-1 size-5 rounded-full bg-white shadow transition-all ${u.remind ? 'left-6' : 'left-1'}`} />
              </button>
            </div>

            {push.status === 'unavailable' && <p className="mt-3 text-xs text-ink-2">{pushHelp[push.reason]}</p>}
            {push.status === 'denied' && (
              <p className="mt-3 text-xs text-ink-2">Notifications are blocked for MBus. Allow them in your browser or phone settings.</p>
            )}

            {u.remind && (
              <div className="mt-4 space-y-3">
                <div>
                  <p className="text-xs font-medium text-ink-3">How early</p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {REMIND_OPTIONS.map(m => (
                      <button
                        key={m}
                        onClick={() => setU({ ...u, remindBefore: m })}
                        aria-pressed={u.remindBefore === m}
                        className={`rounded-lg px-3 py-1.5 text-sm font-medium ${u.remindBefore === m ? 'bg-ink text-bg' : 'bg-surface-2 text-ink-2'}`}
                      >
                        {m === 0 ? 'When I should leave' : `${m} min before`}
                      </button>
                    ))}
                  </div>
                </div>
                {next && (
                  <p className="text-xs text-ink-2 tabular">
                    Next: leave by <span className="font-semibold">{formatClock(next.leaveEpoch)}</span>, notification at{' '}
                    <span className="font-semibold">{formatClock(next.notifyEpoch)}</span>
                    {dayLabel(next.departEpoch, Date.now()) && <> ({dayLabel(next.departEpoch, Date.now())?.toLowerCase()})</>}.
                  </p>
                )}
                {push.status === 'on' && (
                  <button
                    onClick={async () => {
                      setTestState('sending');
                      setTestState((await onTestPush()) ? 'sent' : 'failed');
                    }}
                    className="text-xs font-medium text-accent"
                  >
                    {testState === 'sending' ? 'Sending…' : testState === 'sent' ? 'Test sent. Check your notifications.' : testState === 'failed' ? "Couldn't send a test" : 'Send a test notification'}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        <footer className="flex gap-2 border-t border-line px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {onDelete && (
            <button onClick={onDelete} className="rounded-xl bg-surface-2 px-4 py-3 text-late" aria-label="Remove usual bus">
              <Trash2 className="size-5" />
            </button>
          )}
          <button onClick={onClose} className="flex-1 rounded-xl bg-surface-2 px-4 py-3 font-medium">
            Cancel
          </button>
          <button onClick={save} disabled={!u.days.length} className="flex-1 rounded-xl bg-accent px-4 py-3 font-semibold text-accent-ink disabled:opacity-40">
            {isNew ? 'Save' : 'Save changes'}
          </button>
        </footer>
      </div>
    </div>
  );
}

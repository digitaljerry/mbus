'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { UsualBus } from '../lib/usual';
import {
  currentSubscription,
  enablePush,
  pushSupport,
  registerServiceWorker,
  sendTestPush,
  syncReminders,
  type PushSupport,
} from '../lib/pushClient';

export type PushState =
  | { status: 'loading' }
  | { status: 'unavailable'; reason: Extract<PushSupport, { ok: false }>['reason'] }
  | { status: 'off' }
  | { status: 'denied' }
  | { status: 'on'; subscription: PushSubscription };

/**
 * Notification permission + subscription, and keeps the server's reminder
 * scheduler in sync with this device's usual buses.
 */
export function usePush(usual: UsualBus[], loaded: boolean) {
  const [state, setState] = useState<PushState>({ status: 'loading' });
  const [syncError, setSyncError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await registerServiceWorker();
      const support = await pushSupport();
      if (cancelled) return;
      if (!support.ok) return setState({ status: 'unavailable', reason: support.reason });
      if (Notification.permission === 'denied') return setState({ status: 'denied' });
      const sub = await currentSubscription();
      if (cancelled) return;
      setState(sub && Notification.permission === 'granted' ? { status: 'on', subscription: sub } : { status: 'off' });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const enable = useCallback(async () => {
    try {
      const subscription = await enablePush();
      setState({ status: 'on', subscription });
      return true;
    } catch (e) {
      const reason = (e as Error).message;
      if (reason === 'denied') setState({ status: 'denied' });
      return false;
    }
  }, []);

  const test = useCallback(async () => (state.status === 'on' ? sendTestPush(state.subscription) : false), [state]);

  // Sync reminder settings whenever they change (debounced), and once per
  // load, which also restarts the scheduler if it ever stopped.
  const signature = JSON.stringify(usual.filter(u => u.remind));
  const lastSynced = useRef<string | null>(null);
  useEffect(() => {
    if (!loaded || state.status !== 'on') return;
    if (lastSynced.current === signature) return;
    const t = setTimeout(async () => {
      const ok = await syncReminders(state.subscription, usual);
      setSyncError(!ok);
      if (ok) lastSynced.current = signature;
    }, 800);
    return () => clearTimeout(t);
    // `usual` is captured through `signature`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, state, loaded]);

  return { state, enable, test, syncError };
}

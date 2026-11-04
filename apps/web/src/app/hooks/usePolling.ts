'use client';

import { useEffect, useLayoutEffect, useRef } from 'react';

/**
 * Calls `tick` every `intervalMs` while the page is visible. When the tab
 * comes back into view (or the device comes back online) it refreshes
 * immediately if the last run is older than `staleAfterMs`.
 */
export function usePolling(
  tick: () => void | Promise<void>,
  {
    intervalMs,
    staleAfterMs = intervalMs / 2,
    enabled = true,
    resetKey = '',
  }: { intervalMs: number; staleAfterMs?: number; enabled?: boolean; resetKey?: string }
) {
  const tickRef = useRef(tick);
  useLayoutEffect(() => {
    tickRef.current = tick;
  });

  useEffect(() => {
    if (!enabled) return;
    let lastRun = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const run = async () => {
      clearTimeout(timer);
      lastRun = Date.now();
      try {
        await tickRef.current();
      } finally {
        if (document.visibilityState === 'visible') {
          timer = setTimeout(run, intervalMs);
        }
      }
    };

    const wake = () => {
      if (document.visibilityState !== 'visible') {
        clearTimeout(timer);
        return;
      }
      if (Date.now() - lastRun >= staleAfterMs) run();
      else {
        clearTimeout(timer);
        timer = setTimeout(run, intervalMs - (Date.now() - lastRun));
      }
    };

    run();
    document.addEventListener('visibilitychange', wake);
    window.addEventListener('online', wake);
    window.addEventListener('focus', wake);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', wake);
      window.removeEventListener('online', wake);
      window.removeEventListener('focus', wake);
    };
  }, [intervalMs, staleAfterMs, enabled, resetKey]);
}

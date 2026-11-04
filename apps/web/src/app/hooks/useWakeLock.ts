'use client';

import { useEffect, useState } from 'react';

/**
 * Keeps the screen on while `active` is true (Screen Wake Lock API).
 * The browser drops the lock whenever the page is hidden, so it is
 * re-acquired when the page becomes visible again.
 */
export function useWakeLock(active: boolean) {
  const [supported, setSupported] = useState(false);
  const [held, setHeld] = useState(false);

  useEffect(() => {
    setSupported(typeof navigator !== 'undefined' && 'wakeLock' in navigator);
  }, []);

  useEffect(() => {
    if (!active || !supported) return;
    let sentinel: WakeLockSentinel | null = null;
    let cancelled = false;

    const acquire = async () => {
      if (document.visibilityState !== 'visible' || (sentinel && !sentinel.released)) return;
      try {
        sentinel = await navigator.wakeLock.request('screen');
        if (cancelled) {
          sentinel.release();
          return;
        }
        setHeld(true);
        sentinel.addEventListener('release', () => setHeld(false));
      } catch {
        setHeld(false); // e.g. battery saver, or not allowed
      }
    };

    acquire();
    document.addEventListener('visibilitychange', acquire);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', acquire);
      sentinel?.release().catch(() => {});
      setHeld(false);
    };
  }, [active, supported]);

  return { supported, held };
}

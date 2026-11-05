'use client';

import { useEffect, useState } from 'react';
import type { NetworkResponse } from '../lib/network';

let cache: Promise<NetworkResponse | null> | null = null;

/** The static line network, fetched once when first needed. */
export function useNetwork(enabled: boolean) {
  const [network, setNetwork] = useState<NetworkResponse | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!enabled || network) return;
    cache ??= fetch('/api/network')
      .then(r => (r.ok ? r.json() : null))
      .catch(() => null);
    let cancelled = false;
    cache.then(n => {
      if (cancelled) return;
      if (n) setNetwork(n);
      else {
        cache = null;
        setFailed(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [enabled, network]);
  return { network, failed };
}

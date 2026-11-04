'use client';

import { useEffect, useState } from 'react';

/**
 * Current epoch ms, re-rendering every `intervalMs`. Returns 0 until mounted
 * so server and first client render match (avoids hydration mismatches).
 */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(0);
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

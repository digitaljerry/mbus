'use client';

import type { UsualBus } from './usual';

// Web Push in the browser: service worker, permission, subscription, and
// syncing reminder settings to the server-side scheduler.

export type PushSupport =
  | { ok: true }
  | { ok: false; reason: 'unsupported' | 'ios-needs-install' | 'server-disabled' };

let configPromise: Promise<{ enabled: boolean; publicKey?: string }> | null = null;
function loadConfig() {
  configPromise ??= fetch('/api/push/config')
    .then(r => r.json())
    .catch(() => {
      configPromise = null;
      return { enabled: false };
    });
  return configPromise;
}

const isIos = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

export async function pushSupport(): Promise<PushSupport> {
  if (typeof window === 'undefined') return { ok: false, reason: 'unsupported' };
  const hasApis = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  if (!hasApis) return { ok: false, reason: isIos() && !isStandalone() ? 'ios-needs-install' : 'unsupported' };
  const config = await loadConfig();
  if (!config.enabled || !config.publicKey) return { ok: false, reason: 'server-disabled' };
  return { ok: true };
}

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return null;
  try {
    return await navigator.serviceWorker.register('/sw.js', { scope: '/' });
  } catch {
    return null;
  }
}

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/** Existing subscription, without prompting. */
export async function currentSubscription(): Promise<PushSubscription | null> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return null;
  const reg = await navigator.serviceWorker.getRegistration('/');
  return (await reg?.pushManager.getSubscription()) ?? null;
}

/** Ask for permission (must be called from a tap) and subscribe. */
export async function enablePush(): Promise<PushSubscription> {
  const support = await pushSupport();
  if (!support.ok) throw new Error(support.reason);
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('denied');
  const reg = (await registerServiceWorker()) ?? (await navigator.serviceWorker.ready);
  const existing = await reg.pushManager.getSubscription();
  if (existing) return existing;
  const { publicKey } = await loadConfig();
  return reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey!) });
}

/** Tell the scheduler which reminders this device wants. */
export async function syncReminders(subscription: PushSubscription, usual: UsualBus[]): Promise<boolean> {
  try {
    const res = await fetch('/api/push/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscription: subscription.toJSON(), reminders: usual.filter(u => u.remind) }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function sendTestPush(subscription: PushSubscription): Promise<boolean> {
  try {
    const res = await fetch('/api/push/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscription: subscription.toJSON() }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

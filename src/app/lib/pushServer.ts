import webpush, { type PushSubscription } from 'web-push';
import { createHash } from 'node:crypto';

// Web Push (VAPID). Configure with environment variables:
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto:you@example.com)
// Generate a key pair with: npx web-push generate-vapid-keys

export function vapidPublicKey(): string | undefined {
  return process.env.VAPID_PUBLIC_KEY || process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || undefined;
}

export function pushEnabled(): boolean {
  return Boolean(vapidPublicKey() && process.env.VAPID_PRIVATE_KEY);
}

let configured = false;
function configure() {
  if (configured) return;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:mbus@example.com', vapidPublicKey()!, process.env.VAPID_PRIVATE_KEY!);
  configured = true;
}

export interface PushMessage {
  title: string;
  body: string;
  tag?: string;
  url?: string;
  timestamp?: number;
}

/** 'gone' means the browser unsubscribed: stop sending to it. */
export async function sendPush(subscription: PushSubscription, message: PushMessage): Promise<'sent' | 'gone'> {
  configure();
  const options = { TTL: 15 * 60, urgency: 'high' as const };
  try {
    if (process.env.NODE_ENV !== 'production' && subscription.endpoint.startsWith('http://localhost')) {
      // Development: same encrypted request, sent to the local push sink.
      const req = webpush.generateRequestDetails(subscription, JSON.stringify(message), options);
      const res = await fetch(req.endpoint, { method: req.method, headers: req.headers as Record<string, string>, body: new Uint8Array(req.body as Buffer) });
      if (!res.ok) throw Object.assign(new Error(`push sink ${res.status}`), { statusCode: res.status });
      return 'sent';
    }
    await webpush.sendNotification(subscription, JSON.stringify(message), options);
    return 'sent';
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode;
    if (status === 404 || status === 410) return 'gone';
    throw err;
  }
}

export function isPushSubscription(x: unknown): x is PushSubscription {
  const s = x as PushSubscription | null;
  return Boolean(
    s &&
      typeof s.endpoint === 'string' &&
      (/^https:\/\//.test(s.endpoint) || (process.env.NODE_ENV !== 'production' && /^http:\/\/localhost[:/]/.test(s.endpoint))) &&
      typeof s.keys?.p256dh === 'string' &&
      typeof s.keys?.auth === 'string'
  );
}

/** Stable, non-reversible id for a subscription (its endpoint is a secret-ish URL). */
export function subscriptionId(s: PushSubscription): string {
  return createHash('sha256').update(s.endpoint).digest('hex').slice(0, 32);
}

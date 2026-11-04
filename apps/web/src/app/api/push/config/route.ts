import { NextResponse } from 'next/server';
import { pushEnabled, vapidPublicKey } from '../../../lib/pushServer';

export async function GET() {
  return NextResponse.json({ enabled: pushEnabled(), publicKey: pushEnabled() ? vapidPublicKey() : undefined });
}

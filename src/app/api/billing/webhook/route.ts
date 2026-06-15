/**
 * Billing Webhook API — POST: Neero webhook handler
 *
 * This endpoint receives webhooks from Neero and processes
 * subscription lifecycle events.
 *
 * NOTE: This endpoint does NOT use applySecurity because Neero
 * webhooks use their own signature verification. No auth cookies
 * or tokens are expected.
 */

import { NextRequest, NextResponse } from 'next/server';
import { handleWebhook } from '@/lib/billing/neero-client';

export async function OPTIONS() {
  const response = new NextResponse(null, { status: 204 });
  response.headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  return response;
}

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json();

    // Neero webhook handling
    const result = await handleWebhook(payload);

    return NextResponse.json({
      received: result.received,
      event: result.event,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';

    return NextResponse.json(
      { error: 'Webhook processing failed', details: message },
      { status: 500 }
    );
  }
}

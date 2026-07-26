import { NextRequest, NextResponse } from 'next/server';
import { createHash, randomBytes, createHmac } from 'node:crypto';
import { db } from '@/lib/db';
import { createLogger } from '@/lib/logger';

const log = createLogger('api-webhooks');

// ============================================================
// GET /api/webhooks — Lister les webhooks
// ============================================================

export async function GET(request: NextRequest) {
  try {
    const userId = request.headers.get('x-user-id') || 'system';

    const webhooks = await db.$queryRawUnsafe<Array<Record<string, unknown>>>(`
      SELECT id, name, description, url, events, headers, retry_config as "retryConfig",
             timeout_ms as "timeoutMs", is_active as "isActive",
             last_triggered_at as "lastTriggeredAt",
             last_response_status as "lastResponseStatus",
             delivery_count as "deliveryCount",
             success_count as "successCount",
             failure_count as "failureCount",
             created_at as "createdAt", updated_at as "updatedAt"
      FROM webhook_endpoints
      WHERE user_id = $1
      ORDER BY created_at DESC
    `, [userId]);

    return NextResponse.json({ success: true, data: webhooks });
  } catch (err) {
    log.error('Failed to list webhooks', { error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ success: false, error: 'Erreur lors de la recuperation des webhooks' }, { status: 500 });
  }
}

// ============================================================
// POST /api/webhooks — Creer/Tester un webhook
// ============================================================

export async function POST(request: NextRequest) {
  try {
    const userId = request.headers.get('x-user-id') || 'system';
    const body = await request.json();
    const { action } = body;

    // Test d'un webhook
    if (action === 'test' && body.webhookId) {
      const testPayload = {
        event: 'webhook.test',
        timestamp: new Date().toISOString(),
        data: { message: 'Test de livraison depuis Genova' },
      };

      const webhook = await db.$queryRawUnsafe<Array<Record<string, unknown>>>(`
        SELECT * FROM webhook_endpoints WHERE id = $1 AND user_id = $2
      `, [body.webhookId, userId]);

      if (!webhook || webhook.length === 0) {
        return NextResponse.json({ success: false, error: 'Webhook introuvable' }, { status: 404 });
      }

      const wh = webhook[0];
      const startTime = Date.now();

      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), (wh.timeout_ms as number) || 10000);

        const signature = createHmac('sha256', (wh.secret as string) || '')
          .update(JSON.stringify(testPayload))
          .digest('hex');

        const res = await fetch(wh.url as string, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Genova-Signature': signature,
            'X-Genova-Event': 'webhook.test',
            'X-Genova-Delivery': `test_${Date.now()}`,
            ...JSON.parse((wh.headers as string) || '{}'),
          },
          body: JSON.stringify(testPayload),
          signal: controller.signal,
        });

        clearTimeout(timer);
        const durationMs = Date.now() - startTime;

        await db.$executeRawUnsafe(`
          UPDATE webhook_endpoints
          SET last_response_status = $1, last_triggered_at = NOW(), last_error = NULL
          WHERE id = $2
        `, [res.status, body.webhookId]);

        return NextResponse.json({
          success: res.ok,
          data: {
            status: res.status,
            durationMs,
            body: await res.text().catch(() => '(impossible de lire la reponse)'),
          },
        });
      } catch (err) {
        const durationMs = Date.now() - startTime;
        await db.$executeRawUnsafe(`
          UPDATE webhook_endpoints
          SET last_error = $1, last_response_status = NULL
          WHERE id = $2
        `, [err instanceof Error ? err.message : String(err), body.webhookId]);

        return NextResponse.json({
          success: false,
          data: { durationMs, error: err instanceof Error ? err.message : 'Erreur de connexion' },
        });
      }
    }

    // Creation d'un nouveau webhook
    if (!body.name || !body.url) {
      return NextResponse.json({ success: false, error: 'name et url sont requis' }, { status: 400 });
    }

    const events = body.events || ['*'];
    const secret = body.secret || randomBytes(24).toString('hex');

    const result = await db.$executeRawUnsafe(`
      INSERT INTO webhook_endpoints (id, name, description, url, secret, events, headers, retry_config, timeout_ms, is_active, user_id, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW())
      RETURNING id
    `, [
      `wh_${randomBytes(12).toString('hex')}`,
      body.name,
      body.description || '',
      body.url,
      secret,
      JSON.stringify(events),
      JSON.stringify(body.headers || {}),
      JSON.stringify(body.retryConfig || { maxRetries: 3, backoffMs: 1000 }),
      body.timeoutMs || 10000,
      body.isActive !== false,
      userId,
    ]);

    log.info('Webhook created', { userId, webhookName: body.name, events });

    return NextResponse.json({
      success: true,
      data: { name: body.name, url: body.url, events, secret },
      warning: 'Conservez ce secret. Il ne sera plus jamais affiche.',
    }, { status: 201 });
  } catch (err) {
    log.error('Failed to create webhook', { error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ success: false, error: 'Erreur lors de la creation du webhook' }, { status: 500 });
  }
}

// ============================================================
// PATCH /api/webhooks — Mettre a jour un webhook
// ============================================================

export async function PATCH(request: NextRequest) {
  try {
    const userId = request.headers.get('x-user-id') || 'system';
    const body = await request.json();
    const { webhookId, action } = body;

    if (!webhookId) {
      return NextResponse.json({ success: false, error: 'webhookId requis' }, { status: 400 });
    }

    switch (action) {
      case 'toggle':
        await db.$executeRawUnsafe(`
          UPDATE webhook_endpoints SET is_active = NOT is_active WHERE id = $1 AND user_id = $2
        `, [webhookId, userId]);
        return NextResponse.json({ success: true, message: 'Webhook mis a jour' });

      case 'delete':
        await db.$executeRawUnsafe(`
          DELETE FROM webhook_endpoints WHERE id = $1 AND user_id = $2
        `, [webhookId, userId]);
        return NextResponse.json({ success: true, message: 'Webhook supprime' });

      case 'update':
        const updates: string[] = [];
        const params: unknown[] = [];
        let idx = 1;

        if (body.name) { updates.push(`name = $${idx}`); params.push(body.name); idx++; }
        if (body.url) { updates.push(`url = $${idx}`); params.push(body.url); idx++; }
        if (body.description !== undefined) { updates.push(`description = $${idx}`); params.push(body.description); idx++; }
        if (body.events) { updates.push(`events = $${idx}`); params.push(JSON.stringify(body.events)); idx++; }
        if (body.timeoutMs) { updates.push(`timeout_ms = $${idx}`); params.push(body.timeoutMs); idx++; }

        if (updates.length > 0) {
          params.push(webhookId, userId);
          await db.$executeRawUnsafe(`
            UPDATE webhook_endpoints SET ${updates.join(', ')} WHERE id = $${idx} AND user_id = $${idx + 1}
          `, params);
        }

        return NextResponse.json({ success: true, message: 'Webhook mis a jour' });

      default:
        return NextResponse.json({ success: false, error: 'Action non reconnue' }, { status: 400 });
    }
  } catch (err) {
    log.error('Webhook update failed', { error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ success: false, error: 'Erreur de mise a jour' }, { status: 500 });
  }
}

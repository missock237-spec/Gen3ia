// ============================================================
// Guardrails API — Regles de securite pour les agents
// GET: lister les guardrails
// POST: creer un guardrail
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createLogger } from '@/lib/logger';
import { db } from '@/lib/db';
import { applySecurity, secureResponse } from '@/lib/security';

const log = createLogger('guardrails');

const VALID_TYPES = ['content_filter', 'rate_limit', 'permission', 'cost_limit', 'time_restriction', 'action_block', 'custom'];
const VALID_SEVERITIES = ['info', 'warning', 'critical', 'block'];

export async function GET(request: NextRequest) {
  const { auth, error: secError } = await applySecurity(request, { requireAuth: true });
  if (secError || !auth) return secError || NextResponse.json({ error: 'Auth required' }, { status: 401 });

  try {
    const guardrails = await db.guardrail.findMany({
      where: { userId: auth.userId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        type: true,
        description: true,
        rules: true,
        severity: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    const parsed = guardrails.map(g => ({
      ...g,
      rules: typeof g.rules === 'string' ? JSON.parse(g.rules) : g.rules,
    }));

    return NextResponse.json({ success: true, data: parsed });
  } catch (error) {
    log.error('guardrails_fetch_error', { error: String(error) });
    return NextResponse.json({ error: 'Erreur de chargement' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const { auth, error: secError } = await applySecurity(request, { requireAuth: true });
  if (secError || !auth) return secError || NextResponse.json({ error: 'Auth required' }, { status: 401 });

  try {
    const body = await request.json();
    const { name, type, description, rules, severity } = body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json({ error: 'Nom requis' }, { status: 400 });
    }

    if (!type || !VALID_TYPES.includes(type)) {
      return NextResponse.json({
        error: `Type invalide. Types valides: ${VALID_TYPES.join(', ')}`,
      }, { status: 400 });
    }

    const validSeverity = severity && VALID_SEVERITIES.includes(severity) ? severity : 'warning';

    let parsedRules: Record<string, unknown> = {};
    if (rules) {
      try {
        parsedRules = typeof rules === 'string' ? JSON.parse(rules) : rules;
      } catch {
        return NextResponse.json({ error: 'Rules doit etre un JSON valide' }, { status: 400 });
      }
    }

    const guardrail = await db.guardrail.create({
      data: {
        name: name.trim(),
        type,
        description: description || '',
        rules: JSON.stringify(parsedRules),
        severity: validSeverity,
        userId: auth.userId,
      },
    });

    log.info('guardrail_created', { id: guardrail.id, name: guardrail.name, type });

    return NextResponse.json({ success: true, data: guardrail }, { status: 201 });
  } catch (error) {
    log.error('guardrail_create_error', { error: String(error) });
    return NextResponse.json({ error: 'Erreur de creation' }, { status: 500 });
  }
}

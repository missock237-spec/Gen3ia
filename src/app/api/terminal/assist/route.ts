// ============================================================
// POST /api/terminal/assist — Analyse intelligente de commandes
// Mode assisté : explique, sécurise, suggère des alternatives
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { terminalAssistant } from '@/lib/terminal-assistant';
import { applySecurity } from '@/lib/security';
import { createLogger } from '@/lib/logger';

export const dynamic = "force-dynamic";
const log = createLogger('api-terminal-assist');

export async function POST(request: NextRequest) {
  const { auth, error } = await applySecurity(request, { requireAuth: true });
  if (error || !auth) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  try {
    const { command, mode } = await request.json();

    if (!command || typeof command !== 'string') {
      return NextResponse.json({ error: 'Commande requise' }, { status: 400 });
    }

    const trimmed = command.trim();
    if (trimmed.length > 5000) {
      return NextResponse.json({ error: 'Commande trop longue (max 5000 car.)' }, { status: 400 });
    }

    // Analyse complète
    const analysis = terminalAssistant.analyze(trimmed);

    // Auto-correction
    const correction = terminalAssistant.autoCorrect(trimmed);
    if (correction) {
      const correctedAnalysis = terminalAssistant.analyze(correction);
      return NextResponse.json({
        success: true,
        original: trimmed,
        corrected: correction,
        analysis: correctedAnalysis,
        autoCorrected: true,
        message: `🤔 Avez-vous voulu dire : ${correction} ?`,
      });
    }

    // Mode exécution forcée si l'utilisateur a déjà confirmé
    if (mode === 'execute') {
      if (analysis.requiresConfirmation) {
        return NextResponse.json({
          success: true,
          analysis,
          blocked: true,
          message: 'Commande bloquée par sécurité. Confirmez explicitement avec mode=force.',
        });
      }
      return NextResponse.json({
        success: true,
        analysis,
        allowed: true,
        message: 'Commande autorisée',
      });
    }

    log.info('terminal_assist', {
      userId: auth.userId.slice(0, 8),
      risk: analysis.risk,
      commandLength: trimmed.length,
      alternatives: analysis.alternatives.length,
    });

    return NextResponse.json({
      success: true,
      analysis,
      autoCorrected: false,
      original: trimmed,
    });
  } catch (err) {
    log.error('terminal_assist_error', { error: String(err) });
    return NextResponse.json({ error: "Erreur d'analyse" }, { status: 500 });
  }
}

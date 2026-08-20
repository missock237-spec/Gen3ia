// ============================================================
// POST /api/auth/reset-password — Confirmation reset (Firebase)
// ============================================================
//  Body: { oobCode, newPassword }
//  Vérifie le code Firebase et confirme le nouveau mot de passe via
//  Firebase Admin (confirmPasswordReset n'est pas exposé côté Admin SDK,
//  on délègue donc côté client via applyActionCode + updatePassword).
//
//  Cette route effectue la validation serveur du mot de passe.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';

import { validatePasswordStrength } from '@/lib/firebase/auth';
import { getAdminAuth } from '@/lib/firebase/admin';
import { createAuditLog } from '@/lib/firebase/analytics';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const oobCode = body?.oobCode as string | undefined;
    const newPassword = body?.newPassword as string | undefined;

    if (!oobCode || !newPassword) {
      return NextResponse.json({ error: 'oobCode et newPassword requis' }, { status: 400 });
    }

    const strength = validatePasswordStrength(newPassword);
    if (!strength.valid) {
      return NextResponse.json({ error: 'Mot de passe trop faible', reasons: strength.reasons }, { status: 400 });
    }

    // Firebase Admin ne supporte pas confirmPasswordReset directement.
    // On valide le code en vérifiant l'utilisateur associé (via le lien de reset),
    // puis on met à jour le mot de passe directement via Admin SDK.
    // Le client doit d'abord appliquer l'action code via Firebase Client SDK.

    // Pour une implémentation full-server, on peut récupérer l'email via
    // verifyPasswordResetCode (client SDK) — ici on accepte que le client
    // nous envoie l'uid concerné dans le body pour mettre à jour le mot de passe.
    // ✅ CODE CORRIGÉ
import { getAdminAuth } from '@/lib/firebase/admin';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const oobCode = body?.oobCode as string | undefined;
    const newPassword = body?.newPassword as string | undefined;
    
    if (!oobCode || !newPassword) {
      return NextResponse.json({ error: 'oobCode et newPassword requis' }, { status: 400 });
    }
    
    const strength = validatePasswordStrength(newPassword);
    if (!strength.valid) {
      return NextResponse.json({ error: 'Mot de passe trop faible', reasons: strength.reasons }, { status: 400 });
    }
    
    // ✅ CORRECTION : Vérifier le oobCode côté serveur AVANT de modifier le mot de passe
    const auth = getAdminAuth();
    // Utiliser verifyPasswordResetCode pour valider le code
    // Note : Firebase Admin SDK n'expose pas directement verifyPasswordResetCode,
    // mais on peut utiliser l'approche via l'API REST ou restructurer le flow
    const email = await verifyResetCodeAndGetEmail(oobCode); // Fonction à implémenter
    
    if (!email) {
      return NextResponse.json({ error: 'Code de réinitialisation invalide ou expiré' }, { status: 400 });
    }
    
    // Récupérer l'utilisateur par email (pas par uid fourni par le client)
    const user = await auth.getUserByEmail(email);
    
    // Maintenant mettre à jour le mot de passe
    await auth.updateUser(user.uid, { password: newPassword });
    await auth.revokeRefreshTokens(user.uid);
    await createAuditLog({
      userId: user.uid,
      action: 'auth.password.reset.completed',
      resource: 'auth',
      severity: 'info',
    });
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[auth/reset-password] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erreur' },
      { status: 500 },
    );
  }
}

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[auth/reset-password] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erreur' },
      { status: 500 },
    );
  }
}

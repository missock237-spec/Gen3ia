import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth';
import { rotateMasterKey, verifyKey, getSecretRotationChecklist, generateNewMasterKey, keyFingerprint } from '@/lib/security/key-rotation';

export const dynamic = 'force-dynamic';

// POST — Rotate master key
// Body: { oldKey: string, newKey?: string (auto-generated if not provided), dryRun?: boolean }
export async function POST(request: NextRequest) {
  const session = await getServerSession();
  if (!session?.user.id) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  if (session.user.role !== 'admin') return NextResponse.json({ error: 'Accès admin requis' }, { status: 403 });

  try {
    const { oldKey, newKey, dryRun } = await request.json();

    if (!oldKey) return NextResponse.json({ error: 'oldKey requis' }, { status: 400 });

    const finalNewKey = newKey || generateNewMasterKey();
    const report = await rotateMasterKey(oldKey, finalNewKey, dryRun);

    return NextResponse.json({
      success: report.status !== 'failed',
      report,
      newKey: dryRun ? undefined : finalNewKey, // Only return key if not dry run
      instructions: dryRun ? undefined : [
        '1. Mettez à jour VAULT_MASTER_KEY dans votre .env avec la nouvelle clé',
        '2. Redémarrez l\'application',
        '3. Vérifiez que tous les services fonctionnent',
        '4. L\'ancienne clé peut être supprimée après vérification',
      ],
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Erreur inconnue',
    }, { status: 500 });
  }
}

// GET — Check rotation checklist / verify key
export async function GET(request: NextRequest) {
  const session = await getServerSession();
  if (!session?.user.id) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  if (session.user.role !== 'admin') return NextResponse.json({ error: 'Accès admin requis' }, { status: 403 });

  const url = new URL(request.url);
  const scope = url.searchParams.get('scope');

  if (scope === 'checklist') {
    return NextResponse.json({
      success: true,
      checklist: getSecretRotationChecklist(),
    });
  }

  if (scope === 'verify') {
    const key = url.searchParams.get('key');
    if (!key) return NextResponse.json({ error: 'Clé requise' }, { status: 400 });
    const result = await verifyKey(key);
    return NextResponse.json({ success: true, ...result });
  }

  if (scope === 'generate') {
    const newKey = generateNewMasterKey();
    return NextResponse.json({
      success: true,
      newKey,
      fingerprint: keyFingerprint(newKey),
      instructions: 'Ajoutez cette clé à VAULT_MASTER_KEY dans votre .env',
    });
  }

  // Default: return checklist
  return NextResponse.json({
    success: true,
    checklist: getSecretRotationChecklist(),
  });
}

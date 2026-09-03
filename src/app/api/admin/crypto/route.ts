import { NextRequest } from "next/server"
import { z } from "zod"
import { handleRoute, readJson } from "@/lib/api"
import { requireAdmin } from "@/lib/auth/guards"
import { audit } from "@/lib/engines/audit"
import { getKeyring } from "@/lib/connectors/core/crypto"
import {
  generateRotationKey,
  buildTransitionKeyringSpec,
  rotationStatus,
  reencryptAllSecrets,
} from "@/lib/connectors/core/rotation"

/**
 * Administration de la rotation des clés de chiffrement des connecteurs.
 *
 * GET  /api/admin/crypto           — état du keyring + inventaire des versions
 *                                    de chiffrement des secrets (v1 / v2:keyId).
 * POST /api/admin/crypto           — actions :
 *   { action: "prepare" }            → génère une clé + la ligne
 *                                     CONNECTORS_ENCRYPTION_KEYS de transition
 *                                     (à poser sur l'hébergeur AVANT reencrypt) ;
 *   { action: "reencrypt", dryRun? } → re-chiffre tout l'existant vers la clé
 *                                     active du keyring courant ;
 *   { action: "verify" }             → re-inventaire post-migration.
 *
 * Toutes les actions sont journalisées dans l'audit trail (ADMIN_ONLY).
 */
const actionSchema = z.object({
  action: z.enum(["prepare", "reencrypt", "verify"]),
  keyId: z.string().regex(/^[a-zA-Z0-9_-]{1,32}$/).optional(),
  newKeyHex: z.string().regex(/^[0-9a-fA-F]{64}$/).optional(),
  dryRun: z.boolean().optional(),
})

export async function GET(req: NextRequest) {
  return handleRoute(req, async () => {
    await requireAdmin(req)
    const status = await rotationStatus()
    return Response.json({ ok: true, ...status })
  })
}

export async function POST(req: NextRequest) {
  return handleRoute(req, async () => {
    const admin = await requireAdmin(req)
    const body = await readJson(req, actionSchema)

    if (body.action === "prepare") {
      const generated = generateRotationKey()
      const keyId = body.keyId ?? generated.keyId
      const keyHex = (body.newKeyHex ?? generated.keyHex).toLowerCase()
      const current = getKeyring()
      const envLine = buildTransitionKeyringSpec({ newKeyId: keyId, newKeyHex: keyHex, current })
      await audit(req, {
        userId: admin.id,
        action: "CRYPTO_ROTATION_PREPARED",
        entityType: "crypto",
        entityId: keyId,
        detail: { currentKeys: current.map((k) => k.id) },
      })
      return Response.json({
        ok: true,
        action: "prepare",
        keyId,
        keyHex,
        envLine: `CONNECTORS_ENCRYPTION_KEYS=${envLine}`,
        instructions: [
          "1. Posez la variable CONNECTORS_ENCRYPTION_KEYS ci-dessus sur votre hébergeur (Vercel : Settings → Environment Variables) puis re-déployez.",
          "2. La nouvelle clé devient ACTIVE (chiffre les nouvelles écritures), les anciennes restent lisibles pendant la transition — zéro downtime.",
          "3. Lancez ensuite POST { \"action\": \"reencrypt\" } pour migrer l'existant.",
          "4. Vérifiez avec GET (pendingRotation = 0), puis retirez l'ancienne clé de l'environnement.",
        ],
        warning:
          "Conservez keyHex dans votre gestionnaire de secrets — elle n'est affichée qu'une seule fois et n'est PAS persistée par GEN3IA.",
      })
    }

    if (body.action === "reencrypt") {
      const result = await reencryptAllSecrets({ dryRun: body.dryRun ?? false })
      await audit(req, {
        userId: admin.id,
        action: "CRYPTO_ROTATION_REENCRYPT",
        entityType: "crypto",
        detail: { dryRun: body.dryRun ?? false, processed: result.processed, reencrypted: result.reencrypted, failed: result.failed },
      })
      return Response.json({ ok: true, action: "reencrypt", ...result })
    }

    // verify
    const status = await rotationStatus()
    return Response.json({ ok: true, action: "verify", ...status })
  })
}

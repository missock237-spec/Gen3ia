/**
 * CLI de rotation des clés de chiffrement des connecteurs (v3.6).
 *
 * Usage (bun) :
 *   bun scripts/rotate-connectors-key.ts status
 *   bun scripts/rotate-connectors-key.ts prepare
 *   bun scripts/rotate-connectors-key.ts reencrypt [--dry-run]
 *
 * Protocole zéro downtime — cf. src/lib/connectors/core/rotation.ts :
 *   1. prepare  → génère la clé + la ligne CONNECTORS_ENCRYPTION_KEYS
 *                 (posez-la sur l'hébergeur AVANT reencrypt) ;
 *   2. reencrypt → migre l'existant vers la clé active ;
 *   3. status    → vérifie pendingRotation = 0 puis retirez l'ancienne clé.
 */

import { generateRotationKey, buildTransitionKeyringSpec, rotationStatus, reencryptAllSecrets } from "../src/lib/connectors/core/rotation"
import { getKeyring } from "../src/lib/connectors/core/crypto"

async function main() {
  const command = process.argv[2] ?? "status"

  if (command === "status") {
    const status = await rotationStatus()
    console.log("─ Keyring ─".padEnd(30))
    console.log(JSON.stringify(status.keyring, null, 2))
    console.log("\n─ Secrets chiffrés ─")
    console.log(`Comptes connectés : ${status.totalAccounts}`)
    for (const v of status.byVersion) console.log(`  ${v.version.padEnd(24)} ${v.count}`)
    console.log(`À re-chiffrer (clé non active/v1) : ${status.pendingRotation}`)
    console.log(`À jour (clé active) : ${status.upToDate}`)
    return
  }

  if (command === "prepare") {
    const generated = generateRotationKey()
    const current = getKeyring()
    const spec = buildTransitionKeyringSpec({ newKeyId: generated.keyId, newKeyHex: generated.keyHex, current })
    console.log("Nouvelle clé générée :")
    console.log(JSON.stringify(generated, null, 2))
    console.log("\nLigne d'environnement de transition à poser sur l'hébergeur :")
    console.log(`CONNECTORS_ENCRYPTION_KEYS=${spec}`)
    console.log("\nOrdre : 1) posez la variable + re-déployez, 2) bun scripts/rotate-connectors-key.ts reencrypt, 3) status, 4) retirez l'ancienne clé.")
    return
  }

  if (command === "reencrypt") {
    const dryRun = process.argv.includes("--dry-run")
    const result = await reencryptAllSecrets({ dryRun })
    console.log(JSON.stringify(result, null, 2))
    if (result.failed > 0) {
      console.log("\n⚠ Certaines lignes n'ont pas pu être migrées (clé absente ?) :")
      for (const e of result.errors) console.log(`  ${e}`)
      process.exitCode = 1
    }
    return
  }

  console.error("Commande inconnue. Usage : bun scripts/rotate-connectors-key.ts status|prepare|reencrypt [--dry-run]")
  process.exitCode = 2
}

main().catch((err) => {
  console.error("Erreur :", err instanceof Error ? err.message : String(err))
  process.exitCode = 1
})

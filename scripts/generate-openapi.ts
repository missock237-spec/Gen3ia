// ============================================================
// Script de génération OpenAPI
// Utilisation : npx tsx scripts/generate-openapi.ts
// Génère docs/openapi.json à partir des schémas Zod
// ============================================================

import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

async function main() {
  console.log('[OpenAPI] Génération de la spécification...');

  // Simuler les variables d'env nécessaires
  process.env.NEXT_PUBLIC_APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

  try {
    // Importer le registre et enregistrer les routes
    const { openApiRegistry } = await import('../src/lib/openapi/openapi-registry');
    await import('../src/lib/openapi/routes');

    // Générer la spec
    const spec = openApiRegistry.generateSpec();
    const specJson = JSON.stringify(spec, null, 2);

    // Sauvegarder
    const outputPath = resolve(process.cwd(), 'docs', 'openapi.json');
    writeFileSync(outputPath, specJson, 'utf-8');

    const routeCount = openApiRegistry.getRoutes().length;
    const schemaCount = Object.keys(spec.components?.schemas || {}).length;
    const specSize = (Buffer.byteLength(specJson) / 1024).toFixed(1);

    console.log(`[OpenAPI] ✅ Génération réussie !`);
    console.log(`[OpenAPI]   Routes : ${routeCount}`);
    console.log(`[OpenAPI]   Schémas : ${schemaCount}`);
    console.log(`[OpenAPI]   Taille : ${specSize} KB`);
    console.log(`[OpenAPI]   Fichier : ${outputPath}`);
    console.log(`[OpenAPI]   Endpoint : /api/docs/openapi`);
    console.log(`[OpenAPI]   Interface : /api/docs/swagger`);
  } catch (error) {
    console.error('[OpenAPI] ❌ Erreur de génération :', error);
    process.exit(1);
  }
}

main();

// ============================================================
// OBSOLÈTE — Gestionnaire de migrations maison.
//
// Le projet utilise désormais `prisma migrate` comme SEULE source
// de vérité pour les migrations. Ce fichier de gestion manuelle
// cause de la dérive de schéma et ne doit plus être utilisé.
//
// Utilisez à la place :
//   npm run db:generate  → prisma generate
//   npm run db:push      → prisma db push
//   npx prisma migrate dev  → nouveau développement
//   npx prisma migrate deploy → production
//
// Suppression : git rm prisma/migration_manager.ts
// ============================================================
export default function obsoleteMigrationManager() {
  throw new Error("Migration manager maison est OBSOLÈTE. Utilisez prisma migrate.");
}

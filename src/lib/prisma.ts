// ============================================================
// Gen3ia — Prisma shim (compatibilité)
// ============================================================
//  Préserve `import { prisma } from '@/lib/prisma'` (legacy imports).
//  Délègue vers Firestore.
// ============================================================

export { prisma, db, default } from '@/lib/firebase/firestore';

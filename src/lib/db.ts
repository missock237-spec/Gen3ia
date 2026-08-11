// ============================================================
// Gen3ia — DB shim (compatibilité)
// ============================================================
//  Ce fichier préserve l'API historique `import { db, prisma } from '@/lib/db'`
//  utilisée par ~50 API routes. Il délègue désormais vers Firestore.
//
//  Remplace :
//    - src/lib/db.ts (Prisma)
//    - src/lib/prisma.ts (Prisma singleton)
//    - packages/core/src/db.ts (Prisma)
//
//  Backend : Firebase Admin SDK -> Cloud Firestore.
// ============================================================

export { db, prisma, Collections, FirestoreRepository } from '@/lib/firebase/firestore';
export { default } from '@/lib/firebase/firestore';

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
import { dbExt } from '@/lib/firestore-extra';

export { Collections, FirestoreRepository } from '@/lib/firebase/firestore';
export type { FirestoreWhereOp, FirestoreOrderBy, WhereInput, OrderByInput, SelectInput, IncludeInput, FindOptions, FindUniqueOptions, CreateOptions, UpdateOptions, DeleteOptions } from '@/lib/firebase/firestore';

export const db = dbExt;
export const prisma = dbExt;
export default dbExt;

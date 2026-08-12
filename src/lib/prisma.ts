// ============================================================
// Gen3ia — Prisma shim (compatibilité)
// ============================================================
//  Préserve `import { prisma } from '@/lib/prisma'` (legacy imports).
//  Délègue vers Firestore (façade + modèles supplémentaires).
// ============================================================

import { dbExt } from '@/lib/firestore-extra';

export { Collections, FirestoreRepository } from '@/lib/firebase/firestore';
export const db = dbExt;
export const prisma = dbExt;
export default dbExt;

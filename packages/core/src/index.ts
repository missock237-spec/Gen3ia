// @gen3ia/core - Point d'entree principal

export * from './errors.js';
export * from './env-validator.js';
export * from './logger.js';
export * from './repositories/index.js';
export * from './services/index.js';
export * from './validation.js';
export { db, prisma, Collections, FirestoreRepository, default } from './db.js';
export type { FirestoreWhereOp, FirestoreOrderBy, FindOptions, FindUniqueOptions } from './db.js';

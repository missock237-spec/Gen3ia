// ============================================================
// Base Repository — Classe abstraite pour tous les repositories
// ============================================================
// Pattern Repository : centralise l'acces aux donnees Prisma
// Les services appellent les repositories, jamais Prisma directement
// ============================================================

import { db } from '../db';
import { logger } from '../logger';
import { DatabaseError, NotFoundError } from '../errors';

export abstract class BaseRepository<T, TCreate, TUpdate = Partial<TCreate>> {
  protected abstract tableName: string;

  /**
   * Trouver un enregistrement par son ID
   */
  async findById(id: string, select?: Record<string, boolean>): Promise<T | null> {
    try {
      const result = await (db as any)[this.tableName].findUnique({
        where: { id },
        ...(select ? { select } : {}),
      });
      return result as T | null;
    } catch (error) {
      logger.error(`repository.${this.tableName}.findById`, { id, error: String(error) });
      throw new DatabaseError('QUERY_ERROR', `Erreur lors de la recuperation de ${this.tableName}`, { id });
    }
  }

  /**
   * Trouver un enregistrement par un champ unique
   */
  async findByUnique(where: Record<string, unknown>, select?: Record<string, boolean>): Promise<T | null> {
    try {
      const result = await (db as any)[this.tableName].findUnique({
        where,
        ...(select ? { select } : {}),
      });
      return result as T | null;
    } catch (error) {
      logger.error(`repository.${this.tableName}.findByUnique`, { where, error: String(error) });
      throw new DatabaseError('QUERY_ERROR', `Erreur de recherche ${this.tableName}`, { where });
    }
  }

  /**
   * Trouver le premier enregistrement correspondant aux criteres
   */
  async findFirst(where: Record<string, unknown>, include?: Record<string, unknown>): Promise<T | null> {
    try {
      const result = await (db as any)[this.tableName].findFirst({
        where,
        ...(include ? { include } : {}),
      });
      return result as T | null;
    } catch (error) {
      logger.error(`repository.${this.tableName}.findFirst`, { where, error: String(error) });
      throw new DatabaseError('QUERY_ERROR', `Erreur de recherche ${this.tableName}`, { where });
    }
  }

  /**
   * Lister les enregistrements avec pagination
   */
  async findMany(params?: {
    where?: Record<string, unknown>;
    orderBy?: Record<string, 'asc' | 'desc'>;
    skip?: number;
    take?: number;
    select?: Record<string, boolean>;
    include?: Record<string, unknown>;
  }): Promise<T[]> {
    try {
      const results = await (db as any)[this.tableName].findMany(params || {});
      return results as T[];
    } catch (error) {
      logger.error(`repository.${this.tableName}.findMany`, { params, error: String(error) });
      throw new DatabaseError('QUERY_ERROR', `Erreur de liste ${this.tableName}`);
    }
  }

  /**
   * Creer un enregistrement
   */
  async create(data: TCreate): Promise<T> {
    try {
      const result = await (db as any)[this.tableName].create({ data });
      return result as T;
    } catch (error: any) {
      if (error?.code === 'P2002') {
        const fields = error.meta?.target || [];
        throw new DatabaseError('UNIQUE_CONSTRAINT', `Contrainte unique: ${fields.join(', ')}`);
      }
      logger.error(`repository.${this.tableName}.create`, { error: String(error) });
      throw new DatabaseError('QUERY_ERROR', `Erreur de creation ${this.tableName}`);
    }
  }

  /**
   * Mettre a jour un enregistrement
   */
  async update(id: string, data: TUpdate): Promise<T> {
    try {
      const result = await (db as any)[this.tableName].update({
        where: { id },
        data,
      });
      return result as T;
    } catch (error) {
      logger.error(`repository.${this.tableName}.update`, { id, error: String(error) });
      throw new DatabaseError('QUERY_ERROR', `Erreur de mise a jour ${this.tableName}`, { id });
    }
  }

  /**
   * Supprimer un enregistrement
   */
  async delete(id: string): Promise<T> {
    try {
      const result = await (db as any)[this.tableName].delete({ where: { id } });
      return result as T;
    } catch (error) {
      logger.error(`repository.${this.tableName}.delete`, { id, error: String(error) });
      throw new DatabaseError('QUERY_ERROR', `Erreur de suppression ${this.tableName}`, { id });
    }
  }

  /**
   * Compter les enregistrements
   */
  async count(where?: Record<string, unknown>): Promise<number> {
    try {
      return await (db as any)[this.tableName].count({ where });
    } catch (error) {
      logger.error(`repository.${this.tableName}.count`, { where, error: String(error) });
      throw new DatabaseError('QUERY_ERROR', `Erreur de comptage ${this.tableName}`);
    }
  }

  /**
   * Trouver par ID ou lever une erreur
   */
  async findByIdOrThrow(id: string): Promise<T> {
    const result = await this.findById(id);
    if (!result) throw new NotFoundError(this.tableName, id);
    return result;
  }
}

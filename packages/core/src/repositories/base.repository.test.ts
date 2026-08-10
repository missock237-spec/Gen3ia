// ============================================================
// BaseRepository — tests unitaires
// ============================================================
import { describe, it, expect, vi, beforeEach } from 'vitest';

const db = { user: {} };
vi.mock('../db.js', () => ({ db }));
vi.mock('../logger.js', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

import { BaseRepository } from './base.repository.js';
import { DatabaseError, NotFoundError } from '../errors.js';

class DummyRepo extends BaseRepository<any, any> {
  protected tableName = 'user';
}

describe('BaseRepository', () => {
  let repo: DummyRepo;
  beforeEach(() => {
    repo = new DummyRepo();
  });

  describe('findById', () => {
    it('returns a record by id', async () => {
      db.user.findUnique = vi.fn().mockResolvedValue({ id: 'u1' });
      await expect(repo.findById('u1')).resolves.toEqual({ id: 'u1' });
      expect(db.user.findUnique).toHaveBeenCalledWith({ where: { id: 'u1' } });
    });

    it('throws DatabaseError on query failure', async () => {
      db.user.findUnique = vi.fn().mockRejectedValue(new Error('db down'));
      await expect(repo.findById('u1')).rejects.toBeInstanceOf(DatabaseError);
    });
  });

  describe('create', () => {
    it('creates a record', async () => {
      db.user.create = vi.fn().mockResolvedValue({ id: 'u1', email: 'a@b.c' });
      await expect(repo.create({ email: 'a@b.c' })).resolves.toEqual({ id: 'u1', email: 'a@b.c' });
    });

    it('throws DatabaseError on P2002 unique constraint', async () => {
      db.user.create = vi.fn().mockRejectedValue({ code: 'P2002', meta: { target: ['email'] } });
      const err = await repo.create({ email: 'dup@x.com' }).catch(e => e);
      expect(err).toBeInstanceOf(DatabaseError);
      expect(err.code).toBe('UNIQUE_CONSTRAINT');
    });
  });

  describe('findByIdOrThrow', () => {
    it('throws NotFoundError when missing', async () => {
      db.user.findUnique = vi.fn().mockResolvedValue(null);
      await expect(repo.findByIdOrThrow('nope')).rejects.toBeInstanceOf(NotFoundError);
    });

    it('returns the record when found', async () => {
      db.user.findUnique = vi.fn().mockResolvedValue({ id: 'u1' });
      await expect(repo.findByIdOrThrow('u1')).resolves.toEqual({ id: 'u1' });
    });
  });

  describe('count', () => {
    it('returns count', async () => {
      db.user.count = vi.fn().mockResolvedValue(7);
      await expect(repo.count({ plan: 'pro' })).resolves.toBe(7);
      expect(db.user.count).toHaveBeenCalledWith({ where: { plan: 'pro' } });
    });
  });
});

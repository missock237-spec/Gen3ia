import { randomBytes, createHash } from 'node:crypto';
import { writeFile, mkdir, unlink, access } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { createLogger } from '@/lib/logger';

const log = createLogger('upload');

// ============================================================
// Configuration d'upload
// ============================================================

const UPLOAD_DIR = join(process.cwd(), 'public', 'uploads');

/** Limites par type de fichier */
const FILE_LIMITS: Record<string, { maxSize: number; allowedExtensions: string[] }> = {
  image: { maxSize: 20 * 1024 * 1024, allowedExtensions: ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.avif'] },
  document: { maxSize: 50 * 1024 * 1024, allowedExtensions: ['.pdf', '.docx', '.xlsx', '.pptx', '.txt', '.csv', '.md'] },
  data: { maxSize: 100 * 1024 * 1024, allowedExtensions: ['.json', '.csv', '.xml', '.yaml', '.yml'] },
  audio: { maxSize: 100 * 1024 * 1024, allowedExtensions: ['.mp3', '.wav', '.ogg', '.m4a', '.flac', '.aac'] },
  video: { maxSize: 500 * 1024 * 1024, allowedExtensions: ['.mp4', '.webm', '.mov', '.avi', '.mkv'] },
  archive: { maxSize: 200 * 1024 * 1024, allowedExtensions: ['.zip', '.tar', '.gz', '.7z', '.rar'] },
  code: { maxSize: 5 * 1024 * 1024, allowedExtensions: ['.ts', '.tsx', '.js', '.jsx', '.py', '.rs', '.go', '.sql', '.prisma'] },
};

const MAX_CHUNK_SIZE = 10 * 1024 * 1024; // 10MB par chunk
const MAX_FILE_SIZE_GLOBAL = 500 * 1024 * 1024; // 500MB max global

// ============================================================
// Types
// ============================================================

export type FileCategory = 'image' | 'document' | 'data' | 'audio' | 'video' | 'archive' | 'code' | 'unknown';

export interface UploadResult {
  url: string;
  path: string;
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  category: FileCategory;
  hash: string;
  width?: number;
  height?: number;
}

export interface UploadOptions {
  subdir?: string;
  maxSize?: number;
  allowedTypes?: FileCategory[];
  generateThumbnail?: boolean;
}

export interface ChunkUploadInit {
  filename: string;
  totalSize: number;
  totalChunks: number;
  mimeType: string;
  subdir?: string;
}

export interface ChunkUploadPart {
  uploadId: string;
  chunkIndex: number;
  data: ArrayBuffer;
}

// ============================================================
// Utilitaires
// ============================================================

function getCategoryFromMime(mimeType: string): FileCategory {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('audio/')) return 'audio';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.includes('pdf') || mimeType.includes('document') || mimeType.includes('spreadsheet') || mimeType.includes('presentation')) return 'document';
  if (mimeType.includes('json') || mimeType.includes('xml') || mimeType.includes('csv') || mimeType.includes('yaml')) return 'data';
  if (mimeType.includes('zip') || mimeType.includes('tar') || mimeType.includes('gzip') || mimeType.includes('rar') || mimeType.includes('7z')) return 'archive';
  return 'unknown';
}

function getCategoryFromExt(filename: string): FileCategory {
  const ext = extname(filename).toLowerCase();
  for (const [cat, config] of Object.entries(FILE_LIMITS)) {
    if (config.allowedExtensions.includes(ext)) return cat as FileCategory;
  }
  return 'unknown';
}

function computeHash(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

function sanitizeFilename(name: string): string {
  // Supprime les caracteres dangereux, garde l'extension
  const ext = extname(name);
  const base = name.slice(0, -ext.length || undefined);
  const sanitized = base.replace(/[^a-zA-Z0-9_\-\u00C0-\u024F]/g, '_').substring(0, 100);
  return `${sanitized}${ext}`.toLowerCase();
}

// ============================================================
// Validation
// ============================================================

export function validateFile(file: File): { valid: boolean; error?: string } {
  // Verifier si le fichier est vide
  if (file.size === 0) {
    return { valid: false, error: 'Fichier vide' };
  }

  // Taille globale max
  if (file.size > MAX_FILE_SIZE_GLOBAL) {
    return { valid: false, error: `Fichier trop volumineux. Maximum: ${MAX_FILE_SIZE_GLOBAL / 1024 / 1024}MB` };
  }

  // Categoriser et verifier les limites
  const category = getCategoryFromExt(file.name);
  if (category !== 'unknown') {
    const limits = FILE_LIMITS[category];
    if (limits && file.size > limits.maxSize) {
      return { valid: false, error: `Fichier ${category} trop volumineux. Maximum: ${limits.maxSize / 1024 / 1024}MB` };
    }
  }

  return { valid: true };
}

export function validateChunkUpload(init: ChunkUploadInit): { valid: boolean; error?: string } {
  if (init.totalSize > MAX_FILE_SIZE_GLOBAL) {
    return { valid: false, error: `Fichier trop volumineux: ${init.totalSize} octets (max ${MAX_FILE_SIZE_GLOBAL})` };
  }
  if (init.totalChunks < 1 || init.totalChunks > 1000) {
    return { valid: false, error: `Nombre de chunks invalide: ${init.totalChunks}` };
  }
  if (init.totalChunks > 1 && Math.ceil(init.totalSize / init.totalChunks) > MAX_CHUNK_SIZE) {
    return { valid: false, error: `Chunk trop volumineux: chaque chunk max ${MAX_CHUNK_SIZE / 1024 / 1024}MB` };
  }
  return { valid: true };
}

// ============================================================
// Upload simple
// ============================================================

export async function uploadFile(file: File, subdir: string = 'general', options?: UploadOptions): Promise<UploadResult> {
  const validation = options?.maxSize
    ? (file.size <= options.maxSize ? { valid: true } : { valid: false, error: `Fichier trop volumineux. Maximum: ${options.maxSize / 1024 / 1024}MB` })
    : validateFile(file);

  if (!validation.valid) {
    throw new Error(validation.error);
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const hash = computeHash(buffer);
  const ext = extname(file.name).toLowerCase();
  const originalName = file.name;
  const sanitized = sanitizeFilename(file.name);
  const uniqueName = `${Date.now()}-${randomBytes(8).toString('hex')}${ext}`;
  const category = getCategoryFromExt(file.name);
  const dir = join(UPLOAD_DIR, subdir);

  await mkdir(dir, { recursive: true });

  const filePath = join(dir, uniqueName);
  await writeFile(filePath, buffer);

  log.info('File uploaded', { filename: originalName, size: file.size, category, hash: hash.substring(0, 16) });

  const result: UploadResult = {
    url: `/uploads/${subdir}/${uniqueName}`,
    path: filePath,
    filename: uniqueName,
    originalName: sanitized,
    mimeType: file.type,
    size: file.size,
    category,
    hash,
  };

  // Si c'est une image, on peut lire les dimensions
  if (category === 'image' && options?.generateThumbnail) {
    try {
      const sharp = await import('sharp');
      const metadata = await sharp.default(buffer).metadata();
      result.width = metadata.width;
      result.height = metadata.height;
    } catch {}
  }

  return result;
}

// ============================================================
// Upload par chunks (pour fichiers volumineux)
// ============================================================

interface ChunkSession {
  uploadId: string;
  filename: string;
  totalSize: number;
  totalChunks: number;
  receivedChunks: number[];
  buffers: Map<number, Buffer>;
  mimeType: string;
  subdir: string;
  createdAt: number;
}

const chunkSessions = new Map<string, ChunkSession>();

// Nettoyage automatique des sessions expirees (30 min)
setInterval(() => {
  const now = Date.now();
  for (const [id, session] of chunkSessions) {
    if (now - session.createdAt > 30 * 60 * 1000) {
      chunkSessions.delete(id);
      log.debug('Chunk session expired', { uploadId: id });
    }
  }
}, 5 * 60 * 1000);

export function initChunkUpload(init: ChunkUploadInit): { uploadId: string } {
  const validation = validateChunkUpload(init);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  const uploadId = `chunk_${Date.now()}_${randomBytes(12).toString('hex')}`;
  chunkSessions.set(uploadId, {
    uploadId,
    filename: init.filename,
    totalSize: init.totalSize,
    totalChunks: init.totalChunks,
    receivedChunks: [],
    buffers: new Map(),
    mimeType: init.mimeType,
    subdir: init.subdir || 'general',
    createdAt: Date.now(),
  });

  log.info('Chunk upload initialized', { uploadId, totalChunks: init.totalChunks, totalSize: init.totalSize });
  return { uploadId };
}

export async function uploadChunk(part: ChunkUploadPart): Promise<{ completed: boolean; progress: number }> {
  const session = chunkSessions.get(part.uploadId);
  if (!session) {
    throw new Error('Session d\'upload introuvable ou expiree');
  }

  if (part.chunkIndex < 0 || part.chunkIndex >= session.totalChunks) {
    throw new Error(`Index de chunk invalide: ${part.chunkIndex}`);
  }

  if (session.receivedChunks.includes(part.chunkIndex)) {
    throw new Error(`Chunk ${part.chunkIndex} deja recu`);
  }

  const buffer = Buffer.from(part.data);
  session.buffers.set(part.chunkIndex, buffer);
  session.receivedChunks.push(part.chunkIndex);

  const progress = Math.round((session.receivedChunks.length / session.totalChunks) * 100);
  const completed = session.receivedChunks.length === session.totalChunks;

  if (completed) {
    // Assembler tous les chunks
    const fullBuffer = Buffer.concat(
      Array.from({ length: session.totalChunks }, (_, i) => session.buffers.get(i) || Buffer.alloc(0))
    );

    // Verifier la taille totale
    if (fullBuffer.length !== session.totalSize) {
      chunkSessions.delete(part.uploadId);
      throw new Error(`Taille totale incorrecte: attendu ${session.totalSize}, recu ${fullBuffer.length}`);
    }

    // Sauvegarder
    const hash = computeHash(fullBuffer);
    const ext = extname(session.filename).toLowerCase();
    const uniqueName = `${Date.now()}-${randomBytes(8).toString('hex')}${ext}`;
    const dir = join(UPLOAD_DIR, session.subdir);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, uniqueName), fullBuffer);

    log.info('Chunk upload completed', { uploadId: part.uploadId, filename: session.filename, size: session.totalSize });
    chunkSessions.delete(part.uploadId);
  }

  return { completed, progress };
}

export function cancelChunkUpload(uploadId: string): void {
  chunkSessions.delete(uploadId);
  log.debug('Chunk upload cancelled', { uploadId });
}

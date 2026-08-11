// ============================================================
// Gen3ia — Cloud Storage layer (Firebase Storage)
// ============================================================
//  Remplace :
//    - src/lib/upload.ts (filesystem-based uploads)
//    - src/app/api/upload/route.ts (local file writes)
//    - public/uploads/ directory
//
//  Cloud Storage gère désormais :
//    - Upload simple (Buffer / Blob / Stream)
//    - Upload multipart (chunks) via resumable uploads
//    - Validation MIME / taille
//    - Signed URLs (téléchargement temporaire)
//    - Métadonnées (contentType, customMetadata)
//    - Suppression sécurisée
//    - Public read URLs (pour les avatars / images publiques)
// ============================================================

import { randomBytes, createHash } from 'node:crypto';
import { extname } from 'node:path';

import { getAdminStorage } from './admin';
import { logEvent } from './analytics';

// ============================================================
// Configuration
// ============================================================

const FILE_LIMITS: Record<string, { maxSize: number; allowedExtensions: string[] }> = {
  image: { maxSize: 20 * 1024 * 1024, allowedExtensions: ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.avif'] },
  document: { maxSize: 50 * 1024 * 1024, allowedExtensions: ['.pdf', '.docx', '.xlsx', '.pptx', '.txt', '.csv', '.md'] },
  data: { maxSize: 100 * 1024 * 1024, allowedExtensions: ['.json', '.csv', '.xml', '.yaml', '.yml'] },
  audio: { maxSize: 100 * 1024 * 1024, allowedExtensions: ['.mp3', '.wav', '.ogg', '.m4a', '.flac', '.aac'] },
  video: { maxSize: 500 * 1024 * 1024, allowedExtensions: ['.mp4', '.webm', '.mov', '.avi', '.mkv'] },
  archive: { maxSize: 200 * 1024 * 1024, allowedExtensions: ['.zip', '.tar', '.gz', '.7z', '.rar'] },
  code: { maxSize: 5 * 1024 * 1024, allowedExtensions: ['.ts', '.tsx', '.js', '.jsx', '.py', '.rs', '.go', '.sql'] },
};

const MAX_FILE_SIZE_GLOBAL = 500 * 1024 * 1024;

// ============================================================
// Types
// ============================================================

export type FileCategory = 'image' | 'document' | 'data' | 'audio' | 'video' | 'archive' | 'code' | 'unknown';

export interface UploadResult {
  url: string;            // Signed URL (default) or public URL
  publicUrl: string | null; // gs:// or public URL if file is public
  path: string;           // Cloud Storage object path (e.g. "uploads/images/xxx.png")
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  category: FileCategory;
  hash: string;
  width?: number;
  height?: number;
  bucket: string;
}

export interface UploadOptions {
  subdir?: string;
  maxSize?: number;
  allowedTypes?: FileCategory[];
  generateThumbnail?: boolean;
  contentType?: string;
  public?: boolean;       // Rend le fichier publiquement lisible
  metadata?: Record<string, string>;
  ownerUid?: string;      // UID Firebase Auth propriétaire
}

// ============================================================
// Helpers
// ============================================================

function getCategoryFromExt(filename: string): FileCategory {
  const ext = extname(filename).toLowerCase();
  for (const [cat, config] of Object.entries(FILE_LIMITS)) {
    if (config.allowedExtensions.includes(ext)) return cat as FileCategory;
  }
  return 'unknown';
}

function getCategoryFromMime(mimeType: string): FileCategory {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('audio/')) return 'audio';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.includes('pdf') || mimeType.includes('document') || mimeType.includes('spreadsheet')) return 'document';
  if (mimeType.includes('json') || mimeType.includes('xml') || mimeType.includes('csv')) return 'data';
  if (mimeType.includes('zip') || mimeType.includes('tar') || mimeType.includes('gzip')) return 'archive';
  return 'unknown';
}

function computeHash(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

function sanitizeFilename(name: string): string {
  const ext = extname(name);
  const base = name.slice(0, -ext.length || undefined);
  const sanitized = base.replace(/[^a-zA-Z0-9_\-\u00C0-\u024F]/g, '_').substring(0, 100);
  return `${sanitized}${ext}`.toLowerCase();
}

// ============================================================
// Validation
// ============================================================

export function validateFile(file: File | { name: string; size: number; type?: string }): { valid: boolean; error?: string } {
  if (file.size === 0) return { valid: false, error: 'Fichier vide' };
  if (file.size > MAX_FILE_SIZE_GLOBAL) {
    return { valid: false, error: `Fichier trop volumineux. Maximum: ${MAX_FILE_SIZE_GLOBAL / 1024 / 1024}MB` };
  }
  const category = getCategoryFromExt(file.name);
  if (category !== 'unknown') {
    const limits = FILE_LIMITS[category];
    if (limits && file.size > limits.maxSize) {
      return { valid: false, error: `Fichier ${category} trop volumineux. Maximum: ${limits.maxSize / 1024 / 1024}MB` };
    }
  }
  return { valid: true };
}

// ============================================================
// Upload principal (depuis Buffer / File)
// ============================================================

export async function uploadBuffer(
  buffer: Buffer,
  filename: string,
  mimeType: string,
  options: UploadOptions = {},
): Promise<UploadResult> {
  const subdir = options.subdir || 'general';
  const category = getCategoryFromExt(filename) !== 'unknown'
    ? getCategoryFromExt(filename)
    : getCategoryFromMime(mimeType);

  if (options.allowedTypes && options.allowedTypes.length > 0) {
    if (!options.allowedTypes.includes(category)) {
      throw new Error(`Type de fichier non autorisé: ${category}`);
    }
  }

  if (options.maxSize && buffer.length > options.maxSize) {
    throw new Error(`Fichier trop volumineux. Maximum: ${options.maxSize / 1024 / 1024}MB`);
  }

  const validation = validateFile({ name: filename, size: buffer.length, type: mimeType });
  if (!validation.valid) throw new Error(validation.error);

  const hash = computeHash(buffer);
  const ext = extname(filename).toLowerCase();
  const uniqueName = `${Date.now()}-${randomBytes(8).toString('hex')}${ext}`;
  const objectPath = `uploads/${subdir}/${uniqueName}`;
  const sanitized = sanitizeFilename(filename);

  const storage = getAdminStorage();
  const bucket = storage.bucket();
  const fileRef = bucket.file(objectPath);

  await fileRef.save(buffer, {
    metadata: {
      contentType: options.contentType || mimeType,
      metadata: {
        originalName: sanitized,
        category,
        hash,
        ownerUid: options.ownerUid || '',
        ...options.metadata,
      },
    },
    public: options.public === true,
  });

  let publicUrl: string | null = null;
  if (options.public === true) {
    publicUrl = `https://storage.googleapis.com/${bucket.name}/${objectPath}`;
  }

  const signedUrl = await getSignedUrl(objectPath);

  const result: UploadResult = {
    url: signedUrl,
    publicUrl,
    path: objectPath,
    filename: uniqueName,
    originalName: sanitized,
    mimeType: options.contentType || mimeType,
    size: buffer.length,
    category,
    hash,
    bucket: bucket.name,
  };

  // Si image, lire dimensions
  if (category === 'image' && options.generateThumbnail) {
    try {
      const sharp = (await import('sharp')).default;
      const metadata = await sharp(buffer).metadata();
      result.width = metadata.width;
      result.height = metadata.height;
    } catch {
      // Non bloquant
    }
  }

  // Log analytics
  await logEvent({
    collection: 'uploaded_files',
    data: {
      path: objectPath,
      filename: uniqueName,
      originalName: sanitized,
      mimeType: result.mimeType,
      size: buffer.length,
      category,
      hash,
      ownerUid: options.ownerUid || null,
      public: options.public === true,
      createdAt: new Date(),
    },
  }).catch(() => {});

  return result;
}

/**
 * Upload depuis un objet File (form-data).
 * Compatibilité avec l'ancienne API uploadFile(file, subdir, options).
 */
export async function uploadFile(
  file: File,
  subdir: string = 'general',
  options?: UploadOptions,
): Promise<UploadResult> {
  const buffer = Buffer.from(await file.arrayBuffer());
  return uploadBuffer(buffer, file.name, file.type, { ...options, subdir: options?.subdir || subdir });
}

// ============================================================
// Signed URLs
// ============================================================

export async function getSignedUrl(
  objectPath: string,
  expiresIn: number = 60 * 60, // 1 heure par défaut
): Promise<string> {
  const storage = getAdminStorage();
  const bucket = storage.bucket();
  const fileRef = bucket.file(objectPath);
  const [url] = await fileRef.getSignedUrl({
    version: 'v4',
    action: 'read',
    expires: Date.now() + expiresIn * 1000,
  });
  return url;
}

export async function getPublicUrl(objectPath: string): Promise<string> {
  const storage = getAdminStorage();
  const bucket = storage.bucket();
  return `https://storage.googleapis.com/${bucket.name}/${objectPath}`;
}

// ============================================================
// Suppression
// ============================================================

export async function deleteFile(objectPath: string): Promise<void> {
  const storage = getAdminStorage();
  const bucket = storage.bucket();
  await bucket.file(objectPath).delete();
}

export async function fileExists(objectPath: string): Promise<boolean> {
  const storage = getAdminStorage();
  const bucket = storage.bucket();
  const [exists] = await bucket.file(objectPath).exists();
  return exists;
}

// ============================================================
// Upload par chunks (compatibilité API ancienne)
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
  options: UploadOptions;
  createdAt: number;
}

const chunkSessions = new Map<string, ChunkSession>();

// Nettoyage automatique des sessions expirées (30 min)
setInterval(() => {
  const now = Date.now();
  for (const [id, session] of chunkSessions) {
    if (now - session.createdAt > 30 * 60 * 1000) {
      chunkSessions.delete(id);
    }
  }
}, 5 * 60 * 1000);

export interface ChunkUploadInit {
  filename: string;
  totalSize: number;
  totalChunks: number;
  mimeType: string;
  subdir?: string;
}

export function validateChunkUpload(init: ChunkUploadInit): { valid: boolean; error?: string } {
  if (init.totalSize > MAX_FILE_SIZE_GLOBAL) {
    return { valid: false, error: `Fichier trop volumineux: ${init.totalSize} octets` };
  }
  if (init.totalChunks < 1 || init.totalChunks > 1000) {
    return { valid: false, error: `Nombre de chunks invalide: ${init.totalChunks}` };
  }
  return { valid: true };
}

export function initChunkUpload(init: ChunkUploadInit): { uploadId: string } {
  const validation = validateChunkUpload(init);
  if (!validation.valid) throw new Error(validation.error);

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
    options: {},
    createdAt: Date.now(),
  });
  return { uploadId };
}

export interface ChunkUploadPart {
  uploadId: string;
  chunkIndex: number;
  data: ArrayBuffer;
}

export async function uploadChunk(part: ChunkUploadPart): Promise<{ completed: boolean; progress: number; url?: string }> {
  const session = chunkSessions.get(part.uploadId);
  if (!session) throw new Error('Session d\'upload introuvable ou expirée');
  if (part.chunkIndex < 0 || part.chunkIndex >= session.totalChunks) {
    throw new Error(`Index de chunk invalide: ${part.chunkIndex}`);
  }
  if (session.receivedChunks.includes(part.chunkIndex)) {
    throw new Error(`Chunk ${part.chunkIndex} déjà reçu`);
  }

  session.buffers.set(part.chunkIndex, Buffer.from(part.data));
  session.receivedChunks.push(part.chunkIndex);

  const progress = Math.round((session.receivedChunks.length / session.totalChunks) * 100);
  const completed = session.receivedChunks.length === session.totalChunks;

  if (completed) {
    const fullBuffer = Buffer.concat(
      Array.from({ length: session.totalChunks }, (_, i) => session.buffers.get(i) || Buffer.alloc(0)),
    );
    if (fullBuffer.length !== session.totalSize) {
      chunkSessions.delete(part.uploadId);
      throw new Error(`Taille totale incorrecte: attendu ${session.totalSize}, reçu ${fullBuffer.length}`);
    }
    chunkSessions.delete(part.uploadId);
    const result = await uploadBuffer(fullBuffer, session.filename, session.mimeType, {
      subdir: session.subdir,
      ...session.options,
    });
    return { completed, progress, url: result.url };
  }

  return { completed, progress };
}

export function cancelChunkUpload(uploadId: string): void {
  chunkSessions.delete(uploadId);
}

// ============================================================
// Export par défaut
// ============================================================

export default {
  uploadFile,
  uploadBuffer,
  uploadChunk,
  initChunkUpload,
  cancelChunkUpload,
  validateFile,
  validateChunkUpload,
  getSignedUrl,
  getPublicUrl,
  deleteFile,
  fileExists,
};

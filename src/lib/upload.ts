import { randomBytes } from 'crypto';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';

const UPLOAD_DIR = join(process.cwd(), 'public', 'uploads');
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const ALLOWED_MIME_TYPES = [
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
  'application/pdf',
  'text/plain', 'text/csv',
  'application/json',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
];

export interface UploadResult {
  url: string;
  path: string;
  filename: string;
  mimeType: string;
  size: number;
}

export function validateFile(file: File): { valid: boolean; error?: string } {
  if (file.size > MAX_FILE_SIZE) {
    return { valid: false, error: `Fichier trop volumineux. Maximum: ${MAX_FILE_SIZE / 1024 / 1024}MB` };
  }
  if (!ALLOWED_MIME_TYPES.includes(file.type) && !file.type.startsWith('image/')) {
    return { valid: false, error: `Type de fichier non autorisé: ${file.type}` };
  }
  return { valid: true };
}

export async function uploadFile(file: File, subdir: string = 'general'): Promise<UploadResult> {
  const validation = validateFile(file);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  const ext = file.name.split('.').pop() || 'bin';
  const sanitizedFilename = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const uniqueName = `${Date.now()}-${randomBytes(8).toString('hex')}.${ext}`;
  const dir = join(UPLOAD_DIR, subdir);
  
  await mkdir(dir, { recursive: true });
  
  const buffer = Buffer.from(await file.arrayBuffer());
  const filePath = join(dir, uniqueName);
  await writeFile(filePath, buffer);

  return {
    url: `/uploads/${subdir}/${uniqueName}`,
    path: filePath,
    filename: sanitizedFilename,
    mimeType: file.type,
    size: file.size,
  };
}

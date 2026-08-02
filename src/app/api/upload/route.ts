import { NextRequest, NextResponse } from 'next/server';
import { uploadFile, initChunkUpload, uploadChunk, cancelChunkUpload, validateFile } from '@/lib/upload';
import { createLogger } from '@/lib/logger';





export const dynamic = "force-dynamic";
const log = createLogger('api-upload');

// ============================================================
// POST /api/upload — Upload simple ou initialisation chunk
// ============================================================

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get('content-type') || '';

    // Upload par chunks (JSON)
    if (contentType.includes('application/json')) {
      const body = await request.json();

      // Initialisation d'un upload par chunks
      if (body.action === 'init') {
        const result = initChunkUpload({
          filename: body.filename,
          totalSize: body.totalSize,
          totalChunks: body.totalChunks,
          mimeType: body.mimeType || 'application/octet-stream',
          subdir: body.subdir || 'general',
        });
        log.info('Chunk upload initiated', { uploadId: result.uploadId, filename: body.filename });
        return NextResponse.json({ success: true, ...result }, { status: 201 });
      }

      // Envoi d'un chunk
      if (body.action === 'chunk') {
        const data = Buffer.from(body.data, 'base64');
        const result = await uploadChunk({
          uploadId: body.uploadId,
          chunkIndex: body.chunkIndex,
          data: data.buffer,
        });
        return NextResponse.json({ success: true, ...result });
      }

      // Annulation
      if (body.action === 'cancel') {
        cancelChunkUpload(body.uploadId);
        return NextResponse.json({ success: true, message: 'Upload annule' });
      }

      return NextResponse.json({ error: 'Action non reconnue. Utilisez init, chunk, ou cancel.' }, { status: 400 });
    }

    // Upload classique par formulaire
    const formData = await request.formData();
    const fileField = formData.get('file') as File | null;
    const subdir = (formData.get('subdir') as string) || 'general';
    const generateThumbnail = formData.get('generateThumbnail') === 'true';

    if (!fileField) {
      return NextResponse.json({ error: 'Aucun fichier fourni. Envoyez un champ "file".' }, { status: 400 });
    }

    const validation = validateFile(fileField);
    if (!validation.valid) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    const result = await uploadFile(fileField, subdir, { generateThumbnail });
    log.info('File uploaded via API', { filename: result.originalName, category: result.category, size: result.size });

    return NextResponse.json({ success: true, data: result }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur interne lors de l\'upload';
    log.error('Upload failed', { error: message });
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}

// ============================================================
// GET /api/upload — Lister les fichiers uploades (admin)
// ============================================================

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const subdir = searchParams.get('subdir') || '';

    const { readdir, stat } = await import('node:fs/promises');
    const { join } = await import('node:path');
    const UPLOAD_DIR = join(process.cwd(), 'public', 'uploads');
    const targetDir = subdir ? join(UPLOAD_DIR, subdir) : UPLOAD_DIR;

    let files: string[] = [];
    try {
      files = await readdir(targetDir);
    } catch {
      return NextResponse.json({ success: true, data: [] });
    }

    const fileInfos = await Promise.all(
      files
        .filter(f => !f.startsWith('.'))
        .slice(0, 100)
        .map(async (filename) => {
          const filePath = join(targetDir, filename);
          try {
            const stats = await stat(filePath);
            return {
              filename,
              size: stats.size,
              modifiedAt: stats.mtime.toISOString(),
              url: `/uploads/${subdir ? subdir + '/' : ''}${filename}`,
            };
          } catch { return null; }
        })
    );

    return NextResponse.json({
      success: true,
      data: fileInfos.filter(Boolean),
      path: subdir || '/',
    });
  } catch (err) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : 'Erreur' }, { status: 500 });
  }
}

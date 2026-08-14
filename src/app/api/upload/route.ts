// ============================================================
// /api/upload — Upload via Firebase Cloud Storage
// ============================================================
//  POST : upload simple (form-data) ou upload par chunks (JSON)
//  GET  : liste les fichiers stockés dans Cloud Storage
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import {
  uploadFile,
  initChunkUpload,
  uploadChunk,
  cancelChunkUpload,
  validateFile,
} from '@/lib/upload';
import { createLogger } from '@/lib/logger';
import { getAdminStorage } from '@/lib/firebase/admin';
import { getServerSession } from '@/lib/firebase/auth';

export const dynamic = 'force-dynamic';
const log = createLogger('api-upload');

// ============================================================
// POST /api/upload — Upload simple ou initialisation chunk
// ============================================================

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession();
    if (!session) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }
    const ownerUid = session.user.id;

    const contentType = request.headers.get('content-type') || '';

    // Upload par chunks (JSON)
    if (contentType.includes('application/json')) {
      const body = await request.json();

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

      if (body.action === 'chunk') {
        const data = Buffer.from(body.data, 'base64');
        const result = await uploadChunk({
          uploadId: body.uploadId,
          chunkIndex: body.chunkIndex,
          data: data.buffer,
        });
        return NextResponse.json({ success: true, ...result });
      }

      if (body.action === 'cancel') {
        cancelChunkUpload(body.uploadId);
        return NextResponse.json({ success: true, message: 'Upload annulé' });
      }

      return NextResponse.json(
        { error: 'Action non reconnue. Utilisez init, chunk, ou cancel.' },
        { status: 400 },
      );
    }

    // Upload classique par formulaire
    const formData = await request.formData();
    const fileField = formData.get('file') as File | null;
    const subdir = (formData.get('subdir') as string) || 'general';
    const generateThumbnail = formData.get('generateThumbnail') === 'true';
    const isPublic = formData.get('public') === 'true';

    if (!fileField) {
      return NextResponse.json(
        { error: 'Aucun fichier fourni. Envoyez un champ "file".' },
        { status: 400 },
      );
    }

    const validation = validateFile(fileField);
    if (!validation.valid) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    const result = await uploadFile(fileField, subdir, {
      generateThumbnail,
      public: isPublic,
      ownerUid,
    });
    log.info('File uploaded to Cloud Storage', {
      filename: result.originalName,
      category: result.category,
      size: result.size,
      path: result.path,
    });

    return NextResponse.json({ success: true, data: result }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur interne lors de l\'upload';
    log.error('Upload failed', { error: message });
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}

// ============================================================
// GET /api/upload — Lister les fichiers dans Cloud Storage
// ============================================================

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession();
    if (!session) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const subdir = searchParams.get('subdir') || '';
    const prefix = subdir ? `uploads/${subdir}/` : 'uploads/';

    const storage = getAdminStorage();
    const bucket = storage.bucket();
    const [files] = await bucket.getFiles({ prefix, maxResults: 100, autoPaginate: false });

    const fileInfos = await Promise.all(
      files.slice(0, 100).map(async (f) => {
        const [metadata] = await f.getMetadata();
        return {
          filename: f.name.split('/').pop() || f.name,
          path: f.name,
// @ts-ignore
          size: parseInt(metadata.size || '0', 10),
          mimeType: metadata.contentType || 'application/octet-stream',
          modifiedAt: metadata.updated || new Date().toISOString(),
          bucket: bucket.name,
          url: `https://storage.googleapis.com/${bucket.name}/${f.name}`,
        };
      }),
    );

    return NextResponse.json({
      success: true,
      data: fileInfos,
      path: subdir || '/',
      storageBucket: bucket.name,
    });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Erreur' },
      { status: 500 },
    );
  }
}

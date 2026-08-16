// ============================================================
// Gen3ia — Upload shim (compatibilité)
// ============================================================
//  Préserve l'API historique :
//    import { uploadFile, validateFile, initChunkUpload, uploadChunk } from '@/lib/upload'
//
//  Backend : Firebase Cloud Storage via Admin SDK.
// ============================================================

export {
  uploadFile,
  uploadBuffer,
  validateFile,
  validateChunkUpload,
  initChunkUpload,
  uploadChunk,
  cancelChunkUpload,
  getSignedUrl,
  getPublicUrl,
  deleteFile,
  fileExists,
  type FileCategory,
  type UploadResult,
  type UploadOptions,
  type ChunkUploadInit,
  type ChunkUploadPart,
} from '@/lib/firebase/storage';

export { default } from '@/lib/firebase/storage';

import { getStorage, Storage, bucket } from 'firebase-admin/storage';

let storageInstance: Storage | null = null;

function initStorage() {
  if (!getApps().length) {
    // L'initialisation est déjà faite dans firestore.ts, on s'assure que l'app existe
    throw new Error('Firebase app not initialized. Call initFirestore first.');
  }
  return getStorage();
}

export function getStorageInstance(): Storage {
  if (!storageInstance) {
    storageInstance = initStorage();
  }
  return storageInstance;
}

export const storage = getStorageInstance();
export const defaultBucket = bucket();

// Retry pour les opérations Storage
async function withRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
  let lastError: Error;
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (err: any) {
      lastError = err;
      const delay = Math.min(100 * Math.pow(2, i), 5000);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  throw lastError!;
}

// Upload avec retry
export async function uploadFile(
  fileBuffer: Buffer,
  destination: string,
  contentType?: string
): Promise<string> {
  const file = defaultBucket.file(destination);
  await withRetry(() =>
    file.save(fileBuffer, {
      metadata: { contentType: contentType || 'application/octet-stream' },
      public: true, // ou false selon votre besoin
    })
  );
  return file.publicUrl(); // ou générer l'URL signée
}

// Suppression avec retry
export async function deleteFile(destination: string): Promise<void> {
  const file = defaultBucket.file(destination);
  await withRetry(() => file.delete());
}

// Récupération des métadonnées
export async function getFileMetadata(destination: string) {
  const file = defaultBucket.file(destination);
  return withRetry(() => file.getMetadata());
}

import { db } from '@/lib/db'
import { decryptSecret, encryptSecret } from '@/lib/secret-vault'

interface CreateAccessKeyInput {
  userId: string
  name: string
  description?: string
  service: string
  keyType?: string
  keyValue: string
  endpoint?: string
  scopes?: string
  metadata?: string
  testEndpoint?: string
  expiresAt?: Date
  isActive?: boolean
}

export async function createSecureAccessKey(input: CreateAccessKeyInput) {
  return db.accessKey.create({
    data: {
      userId: input.userId,
      name: input.name,
      description: input.description || '',
      service: input.service,
      keyType: input.keyType || 'api_key',
      keyValue: encryptSecret(input.keyValue),
      endpoint: input.endpoint,
      scopes: input.scopes || '[]',
      metadata: input.metadata || '{}',
      testEndpoint: input.testEndpoint,
      expiresAt: input.expiresAt,
      isActive: input.isActive ?? true,
    },
  })
}

export async function updateSecureAccessKey(
  id: string,
  userId: string,
  updates: Partial<Omit<CreateAccessKeyInput, 'userId'>>
) {
  const data: Record<string, unknown> = {}

  if (updates.name !== undefined) data.name = updates.name
  if (updates.description !== undefined) data.description = updates.description
  if (updates.service !== undefined) data.service = updates.service
  if (updates.keyType !== undefined) data.keyType = updates.keyType
  if (updates.endpoint !== undefined) data.endpoint = updates.endpoint
  if (updates.scopes !== undefined) data.scopes = updates.scopes
  if (updates.metadata !== undefined) data.metadata = updates.metadata
  if (updates.testEndpoint !== undefined) data.testEndpoint = updates.testEndpoint
  if (updates.expiresAt !== undefined) data.expiresAt = updates.expiresAt
  if (updates.isActive !== undefined) data.isActive = updates.isActive

  if (updates.keyValue !== undefined) {
    data.keyValue = encryptSecret(updates.keyValue)
  }

  return db.accessKey.update({
    where: { id, userId },
    data,
  })
}

export async function getDecryptedAccessKey(id: string, userId: string) {
  const key = await db.accessKey.findFirst({
    where: { id, userId },
  })

  if (!key) return null

  return {
    ...key,
    keyValue: decryptSecret(key.keyValue),
  }
}

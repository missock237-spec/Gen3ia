import { db } from '@/lib/db'
import { decryptSecret, encryptSecret } from '@/lib/secret-vault'

interface CreateUserResourceInput {
  userId: string
  type: string
  name: string
  config: string
  apiKey?: string
  endpoint?: string | null
  isActive?: boolean
}

interface UpdateUserResourceInput {
  name?: string
  config?: string
  apiKey?: string | null
  endpoint?: string | null
  isActive?: boolean
}

export async function createSecureUserResource(input: CreateUserResourceInput) {
  return db.userResource.create({
    data: {
      userId: input.userId,
      type: input.type,
      name: input.name,
      config: input.config,
      apiKey: input.apiKey ? encryptSecret(input.apiKey) : null,
      endpoint: input.endpoint ?? null,
      isActive: input.isActive ?? true,
    },
  })
}

export async function updateSecureUserResource(
  id: string,
  userId: string,
  updates: UpdateUserResourceInput
) {
  const data: Record<string, unknown> = {}

  if (updates.name !== undefined) data.name = updates.name
  if (updates.config !== undefined) data.config = updates.config
  if (updates.endpoint !== undefined) data.endpoint = updates.endpoint
  if (updates.isActive !== undefined) data.isActive = updates.isActive

  if (updates.apiKey !== undefined) {
    data.apiKey = updates.apiKey ? encryptSecret(updates.apiKey) : null
  }

  const existing = await db.userResource.findFirst({
    where: { id, userId },
  })

  if (!existing) {
    throw new Error('Resource not found')
  }

  return db.userResource.update({
    where: { id },
    data,
  })
}

export async function getDecryptedUserResource(id: string, userId: string) {
  const resource = await db.userResource.findFirst({
    where: { id, userId },
  })

  if (!resource) return null

  return {
    ...resource,
    apiKey: resource.apiKey ? decryptSecret(resource.apiKey) : null,
  }
}

export async function listSecureUserResources(
  userId: string,
  type?: string
) {
  const resources = await db.userResource.findMany({
    where: {
      userId,
      ...(type ? { type } : {}),
    },
    orderBy: { createdAt: 'desc' },
  })

  return resources.map((resource) => ({
    ...resource,
    apiKey: resource.apiKey ? decryptSecret(resource.apiKey) : null,
  }))
}

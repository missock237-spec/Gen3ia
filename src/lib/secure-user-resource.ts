import { db } from '@/lib/db'
import { decryptSecret, encryptSecret } from '@/lib/secret-vault'

interface CreateUserResourceInput {
  userId: string
  type: string
  name: string
  config: string
  apiKey?: string
  endpoint?: string
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
      endpoint: input.endpoint,
      isActive: input.isActive ?? true,
    },
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

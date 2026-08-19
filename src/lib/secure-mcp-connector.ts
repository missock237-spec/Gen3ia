import { db } from '@/lib/db'
import { decryptSecret, encryptSecret } from '@/lib/secret-vault'

interface CreateMCPConnectorInput {
  userId: string
  name: string
  description?: string
  serverUrl: string
  transportType?: string
  status?: string
  authType?: string
  authConfig?: Record<string, unknown>
  tools?: string
  resources?: string
  prompts?: string
  capabilities?: string
  serverInfo?: string
  isActive?: boolean
}

export async function createSecureMCPConnector(
  input: CreateMCPConnectorInput
) {
  return db.mCPConnector.create({
    data: {
      userId: input.userId,
      name: input.name,
      description: input.description || '',
      serverUrl: input.serverUrl,
      transportType: input.transportType || 'sse',
      status: input.status || 'disconnected',
      authType: input.authType || 'none',
      authConfig: input.authConfig
        ? encryptSecret(JSON.stringify(input.authConfig))
        : '{}',
      tools: input.tools || '[]',
      resources: input.resources || '[]',
      prompts: input.prompts || '[]',
      capabilities: input.capabilities || '{}',
      serverInfo: input.serverInfo || '{}',
      isActive: input.isActive ?? true,
    },
  })
}

export async function getDecryptedMCPConnector(id: string, userId: string) {
  const connector = await db.mCPConnector.findFirst({
    where: { id, userId },
  })

  if (!connector) return null

  let authConfig: Record<string, unknown> = {}

  if (connector.authConfig && connector.authConfig !== '{}') {
    try {
      authConfig = JSON.parse(decryptSecret(connector.authConfig))
    } catch {
      authConfig = {}
    }
  }

  return {
    ...connector,
    authConfig,
  }
}

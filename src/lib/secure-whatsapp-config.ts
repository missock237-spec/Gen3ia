import { db } from '@/lib/db'
import { decryptSecret, encryptSecret } from '@/lib/secret-vault'

interface UpsertWhatsAppConfigInput {
  userId: string
  phoneNumber: string
  whatsappId?: string
  phoneNumberId?: string
  apiToken?: string
  isActive?: boolean
  autoMessage?: boolean
  autoCall?: boolean
}

export async function upsertSecureWhatsAppConfig(
  input: UpsertWhatsAppConfigInput
) {
  const existing = await db.whatsAppConfig.findUnique({
    where: { userId: input.userId },
  })

  const data = {
    phoneNumber: input.phoneNumber,
    whatsappId: input.whatsappId || null,
    phoneNumberId: input.phoneNumberId || null,
    apiToken: input.apiToken ? encryptSecret(input.apiToken) : null,
    isActive: input.isActive ?? false,
    autoMessage: input.autoMessage ?? false,
    autoCall: input.autoCall ?? false,
  }

  if (existing) {
    return db.whatsAppConfig.update({
      where: { userId: input.userId },
      data,
    })
  }

  return db.whatsAppConfig.create({
    data: {
      userId: input.userId,
      ...data,
    },
  })
}

export async function getDecryptedWhatsAppConfig(userId: string) {
  const config = await db.whatsAppConfig.findUnique({
    where: { userId },
  })

  if (!config) return null

  return {
    ...config,
    apiToken: config.apiToken ? decryptSecret(config.apiToken) : null,
  }
}

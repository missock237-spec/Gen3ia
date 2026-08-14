import { db } from '@/lib/db'
import { decryptSecret, encryptSecret } from '@/lib/secret-vault'

interface CreateSocialAccountInput {
  userId: string
  platform: string
  accountId: string
  accountName: string
  accessToken: string
  refreshToken?: string
  isActive?: boolean
}

export async function createSecureSocialAccount(
  input: CreateSocialAccountInput
) {
  return db.socialAccount.create({
    data: {
      userId: input.userId,
      platform: input.platform,
      accountId: input.accountId,
      accountName: input.accountName,
      accessToken: encryptSecret(input.accessToken),
      refreshToken: input.refreshToken
        ? encryptSecret(input.refreshToken)
        : null,
      isActive: input.isActive ?? true,
    },
  })
}

export async function getDecryptedSocialAccount(id: string, userId: string) {
  const account = await db.socialAccount.findFirst({
    where: { id, userId },
  })

  if (!account) return null

  return {
    ...account,
    accessToken: decryptSecret(account.accessToken),
    refreshToken: account.refreshToken
      ? decryptSecret(account.refreshToken)
      : null,
  }
}

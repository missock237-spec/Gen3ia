import { db } from '@/src/lib/db'
import { encryptSecret, looksEncrypted } from '@/src/lib/secret-vault'

async function main() {
  const socialAccounts = await db.socialAccount.findMany()
  for (const item of socialAccounts) {
    await db.socialAccount.update({
      where: { id: item.id },
      data: {
        accessToken: looksEncrypted(item.accessToken)
          ? item.accessToken
          : encryptSecret(item.accessToken),
        refreshToken: item.refreshToken
          ? looksEncrypted(item.refreshToken)
            ? item.refreshToken
            : encryptSecret(item.refreshToken)
          : null,
      },
    })
  }

  const userResources = await db.userResource.findMany()
  for (const item of userResources) {
    await db.userResource.update({
      where: { id: item.id },
      data: {
        apiKey: item.apiKey
          ? looksEncrypted(item.apiKey)
            ? item.apiKey
            : encryptSecret(item.apiKey)
          : null,
      },
    })
  }

  const whatsappConfigs = await db.whatsAppConfig.findMany()
  for (const item of whatsappConfigs) {
    await db.whatsAppConfig.update({
      where: { id: item.id },
      data: {
        apiToken: item.apiToken
          ? looksEncrypted(item.apiToken)
            ? item.apiToken
            : encryptSecret(item.apiToken)
          : null,
      },
    })
  }

  const accessKeys = await db.accessKey.findMany()
  for (const item of accessKeys) {
    await db.accessKey.update({
      where: { id: item.id },
      data: {
        keyValue: looksEncrypted(item.keyValue)
          ? item.keyValue
          : encryptSecret(item.keyValue),
      },
    })
  }

  const connectors = await db.mCPConnector.findMany()
  for (const item of connectors) {
    if (!item.authConfig || item.authConfig === '{}') continue

    await db.mCPConnector.update({
      where: { id: item.id },
      data: {
        authConfig: looksEncrypted(item.authConfig)
          ? item.authConfig
          : encryptSecret(item.authConfig),
      },
    })
  }

  console.log('Secret migration completed successfully.')
}

main()
  .catch((error) => {
    console.error('Secret migration failed:', error)
    process.exit(1)
  })
  .finally(async () => {
    await db.$disconnect()
  })

import { db } from '../src/lib/db'
import { encryptSecret, looksEncrypted } from '../src/lib/secret-vault'

const DRY_RUN = process.env.DRY_RUN === '1'

async function migrateSocialAccounts() {
  const accounts = await db.socialAccount.findMany({
    select: {
      id: true,
      accessToken: true,
      refreshToken: true,
    },
  })

  let updated = 0
  let skipped = 0

  for (const account of accounts) {
    const data: Record<string, string | null> = {}
    let changed = false

    if (account.accessToken && !looksEncrypted(account.accessToken)) {
      data.accessToken = encryptSecret(account.accessToken)
      changed = true
    }

    if (
      account.refreshToken &&
      !looksEncrypted(account.refreshToken)
    ) {
      data.refreshToken = encryptSecret(account.refreshToken)
      changed = true
    }

    if (!changed) {
      skipped++
      continue
    }

    if (!DRY_RUN) {
      await db.socialAccount.update({
        where: { id: account.id },
        data,
      })
    }

    updated++
  }

  return { updated, skipped, total: accounts.length }
}

async function migrateUserResources() {
  const resources = await db.userResource.findMany({
    select: {
      id: true,
      apiKey: true,
    },
  })

  let updated = 0
  let skipped = 0

  for (const resource of resources) {
    if (!resource.apiKey || looksEncrypted(resource.apiKey)) {
      skipped++
      continue
    }

    if (!DRY_RUN) {
      await db.userResource.update({
        where: { id: resource.id },
        data: {
          apiKey: encryptSecret(resource.apiKey),
        },
      })
    }

    updated++
  }

  return { updated, skipped, total: resources.length }
}

async function migrateWhatsAppConfigs() {
  const configs = await db.whatsAppConfig.findMany({
    select: {
      id: true,
      apiToken: true,
    },
  })

  let updated = 0
  let skipped = 0

  for (const config of configs) {
    if (!config.apiToken || looksEncrypted(config.apiToken)) {
      skipped++
      continue
    }

    if (!DRY_RUN) {
      await db.whatsAppConfig.update({
        where: { id: config.id },
        data: {
          apiToken: encryptSecret(config.apiToken),
        },
      })
    }

    updated++
  }

  return { updated, skipped, total: configs.length }
}

async function main() {
  console.log(
    DRY_RUN
      ? 'Starting secret migration in DRY_RUN mode...'
      : 'Starting secret migration...'
  )

  const social = await migrateSocialAccounts()
  const resources = await migrateUserResources()
  const whatsapp = await migrateWhatsAppConfigs()

  console.log('')
  console.log('Migration summary:')
  console.log('------------------')
  console.log(
    `SocialAccount     total=${social.total} updated=${social.updated} skipped=${social.skipped}`
  )
  console.log(
    `UserResource      total=${resources.total} updated=${resources.updated} skipped=${resources.skipped}`
  )
  console.log(
    `WhatsAppConfig    total=${whatsapp.total} updated=${whatsapp.updated} skipped=${whatsapp.skipped}`
  )
  console.log('')

  if (DRY_RUN) {
    console.log('No database changes were written.')
  } else {
    console.log('Secret migration completed successfully.')
  }
}

main()
  .catch((error) => {
    console.error('Secret migration failed:', error)
    process.exit(1)
  })
  .finally(async () => {
    await db.$disconnect()
  })

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

async function main() {
  // eslint-disable-next-line no-console
  console.log(
    DRY_RUN
      ? 'Starting secret migration in DRY_RUN mode...'
      : 'Starting secret migration...'
  )

  const social = await migrateSocialAccounts()
  const resources = await migrateUserResources()

  // eslint-disable-next-line no-console
  console.log('')
  // eslint-disable-next-line no-console
  console.log('Migration summary:')
  // eslint-disable-next-line no-console
  console.log('------------------')
  // eslint-disable-next-line no-console
  console.log(
    `SocialAccount     total=${social.total} updated=${social.updated} skipped=${social.skipped}`
  )
  // eslint-disable-next-line no-console
  console.log(
    `UserResource      total=${resources.total} updated=${resources.updated} skipped=${resources.skipped}`
  )
  // eslint-disable-next-line no-console
  console.log('')

  if (DRY_RUN) {
    // eslint-disable-next-line no-console
    console.log('No database changes were written.')
  } else {
    // eslint-disable-next-line no-console
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

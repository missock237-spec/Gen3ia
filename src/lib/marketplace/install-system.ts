import { db } from '@/lib/db'
import { getListingConfigForAccess } from '@/lib/marketplace/listing-manager'

export interface InstallMarketplaceItemOptions {
  userId: string
  listingId: string
  name?: string
}

export interface MarketplaceInstallResult {
  listingId: string
  listingType: string
  installedResourceType: 'agent' | 'workflow' | 'template' | 'plugin'
  installedResourceId: string
  installedName: string
  metadata: Record<string, unknown>
}

function safeString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback
}

function safeObject(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function stringify(value: unknown, fallback: unknown): string {
  try {
    return JSON.stringify(value ?? fallback)
  } catch {
    return JSON.stringify(fallback)
  }
}

function buildInstallMetadata(listingId: string, sourceType: string): Record<string, unknown> {
  return {
    marketplace: {
      listingId,
      sourceType,
      installedAt: new Date().toISOString(),
    },
  }
}

export async function installMarketplaceItem(
  options: InstallMarketplaceItemOptions
): Promise<MarketplaceInstallResult> {
  const { userId, listingId } = options
  const listing = await getListingConfigForAccess(userId, listingId)
  const config = safeObject(listing.config)
  const installName = safeString(options.name, listing.name)
  const metadata = buildInstallMetadata(listing.id, listing.type)

  if (listing.type === 'agent') {
    const agentConfig = safeObject(config.agent || config)
    const agent = await db.agent.create({
      data: {
        userId,
        name: installName,
        type: safeString(agentConfig.type, 'marketplace'),
        description: safeString(agentConfig.description, listing.description),
        status: safeString(agentConfig.status, 'inactive'),
        config: stringify(
          {
            ...agentConfig,
            ...metadata,
          },
          metadata
        ),
        avatar: typeof agentConfig.avatar === 'string' ? agentConfig.avatar : null,
      },
    })

    await db.marketplaceListing.update({
      where: { id: listingId },
      data: { installCount: { increment: 1 } },
    })

    return {
      listingId,
      listingType: listing.type,
      installedResourceType: 'agent',
      installedResourceId: agent.id,
      installedName: agent.name,
      metadata,
    }
  }

  if (listing.type === 'workflow') {
    const workflowConfig = safeObject(config.workflow || config)
    const workflow = await db.workflow.create({
      data: {
        userId,
        name: installName,
        description: safeString(workflowConfig.description, listing.description),
        status: 'draft',
        steps: stringify(workflowConfig.steps, []),
        trigger: safeString(workflowConfig.trigger, 'manual'),
      },
    })

    await db.marketplaceListing.update({
      where: { id: listingId },
      data: { installCount: { increment: 1 } },
    })

    return {
      listingId,
      listingType: listing.type,
      installedResourceType: 'workflow',
      installedResourceId: workflow.id,
      installedName: workflow.name,
      metadata,
    }
  }

  if (listing.type === 'template') {
    const templateResource = await db.userResource.create({
      data: {
        userId,
        type: 'marketplace_template',
        name: installName,
        config: stringify(
          {
            template: config,
            ...metadata,
          },
          metadata
        ),
        isActive: true,
      },
    })

    await db.marketplaceListing.update({
      where: { id: listingId },
      data: { installCount: { increment: 1 } },
    })

    return {
      listingId,
      listingType: listing.type,
      installedResourceType: 'template',
      installedResourceId: templateResource.id,
      installedName: templateResource.name,
      metadata,
    }
  }

  if (listing.type === 'plugin') {
    const pluginResource = await db.userResource.create({
      data: {
        userId,
        type: 'marketplace_plugin',
        name: installName,
        config: stringify(
          {
            plugin: config,
            ...metadata,
          },
          metadata
        ),
        endpoint: typeof config.endpoint === 'string' ? config.endpoint : null,
        isActive: true,
      },
    })

    await db.marketplaceListing.update({
      where: { id: listingId },
      data: { installCount: { increment: 1 } },
    })

    return {
      listingId,
      listingType: listing.type,
      installedResourceType: 'plugin',
      installedResourceId: pluginResource.id,
      installedName: pluginResource.name,
      metadata,
    }
  }

  throw new Error(`Unsupported marketplace listing type: ${listing.type}`)
}

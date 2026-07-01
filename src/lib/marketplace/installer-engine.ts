/**
 * Marketplace Installer Engine
 *
 * Handles the automatic deployment of marketplace assets into a user's workspace.
 * Assets can be templates, workflows, or APIs.
 */

import { db } from '@/lib/db';
import { createLogger } from '@/lib/logger';
import { ListingType } from './listing-manager';

const log = createLogger('installer-engine');

export async function installListing(userId: string, listingId: string) {
  const listing = await db.marketplaceListing.findUnique({
    where: { id: listingId }
  });

  if (!listing) throw new Error('Listing not found');

  log.info('Installing marketplace asset', { userId, listingId, type: listing.type });

  try {
    switch (listing.type as ListingType) {
      case 'template':
        await installTemplate(userId, listing);
        break;
      case 'workflow':
        await installWorkflow(userId, listing);
        break;
      case 'api':
        await installAPI(userId, listing);
        break;
      default:
        throw new Error(`Unsupported listing type: ${listing.type}`);
    }

    log.info('Asset installed successfully', { userId, listingId });
  } catch (error: any) {
    log.error('Failed to install asset', { userId, listingId, error: error.message });
    throw error;
  }
}

async function installTemplate(userId: string, listing: any) {
  // 1. Create a workspace entry or page for the template
  // Templates usually define a UI structure or a predefined setup.
  const config = JSON.parse(listing.config || '{}');

  await db.workspaceActivity.create({
    data: {
      userId,
      workspaceId: config.workspaceId || 'default', // Fallback or logic to find user workspace
      action: 'install_template',
      details: JSON.stringify({
        listingId: listing.id,
        name: listing.name,
        installedAt: new Date()
      })
    }
  });

  // Implementation-specific: clone UI components or structure
  // For Genova, this might involve creating Workspace resources.
}

async function installWorkflow(userId: string, listing: any) {
  // Workflows are automated jobs (n8n/BullMQ)
  const config = JSON.parse(listing.config || '{}');

  // Clone the workflow into the user's account
  const workflow = await db.workflow.create({
    data: {
      userId,
      name: `[CLONE] ${listing.name}`,
      description: listing.description,
      status: 'draft', // Set to draft so user can customize
      steps: config.steps || '[]',
      trigger: config.trigger || 'manual',
    }
  });

  // If listing contains agent configurations, clone them as well
  if (config.agents && Array.isArray(config.agents)) {
    for (const agentCfg of config.agents) {
      await db.agent.create({
        data: {
          userId,
          name: agentCfg.name || 'AI Agent',
          type: agentCfg.type || 'custom',
          description: agentCfg.description || '',
          config: JSON.stringify(agentCfg.config || {}),
          status: 'inactive'
        }
      });
    }
  }

  log.info('Workflow and associated agents cloned for user', { userId, workflowId: workflow.id });
}

export async function triggerAutoInstaller(purchaseId: string) {
  const purchase = await db.marketplacePurchase.findUnique({
    where: { id: purchaseId },
    include: { listing: true }
  });

  if (!purchase) {
    log.error('Purchase not found for auto-install', { purchaseId });
    return;
  }

  try {
    await installListing(purchase.userId, purchase.listingId);

    // Update purchase metadata to mark as installed
    const metadata = JSON.parse(purchase.metadata || '{}');
    await db.marketplacePurchase.update({
      where: { id: purchaseId },
      data: {
        metadata: JSON.stringify({ ...metadata, installed: true, installedAt: new Date() })
      }
    });
  } catch (error: any) {
    log.error('Auto-install failed', { purchaseId, error: error.message });
  }
}

async function installAPI(userId: string, listing: any) {
  // APIs are connectors or wrappers
  const config = JSON.parse(listing.config || '{}');

  await db.accessKey.create({
    data: {
      userId,
      name: `${listing.name} (Marketplace)`,
      service: config.service || 'custom',
      keyValue: 'PENDING_USER_CONFIG', // User needs to provide their own key usually
      metadata: JSON.stringify({
        listingId: listing.id,
        instructions: listing.documentation
      })
    }
  });
}

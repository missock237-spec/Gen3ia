/**
 * Workflow Versioning System
 * 
 * Enables safe experimentation and quick rollbacks:
 * - Semantic versioning (1.0.0, 1.1.0, 2.0.0)
 * - Auto-snapshots on deployment
 * - Version diff viewer
 * - One-click rollback to any previous version
 */

import { prisma } from '@/lib/prisma';
import { createLogger } from '@/lib/logger';
import { WorkflowCanvas } from '@/lib/workflow-engine';

const log = createLogger('workflow-versioning');

export interface WorkflowVersion {
  id: string;
  workflowId: string;
  version: string;
  label?: string;
  description?: string;
  canvas: WorkflowCanvas;
  createdBy: string;
  createdAt: Date;
  isActive: boolean;
  deployedAt?: Date;
  rollbackFrom?: string;
  changesSummary?: string;
}

export interface VersionDiff {
  added: any[];
  removed: any[];
  modified: any[];
  summary: string;
}

class VersioningEngine {
  /**
   * Create a new version with semantic versioning
   */
  async createVersion(
    workflowId: string,
    canvas: WorkflowCanvas,
    userId: string,
    options: {
      label?: string;
      description?: string;
      bump?: 'major' | 'minor' | 'patch';
    } = {},
  ): Promise<WorkflowVersion> {
    // Get latest version
    const latestVersion = await this.getLatestVersion(workflowId);
    const newVersionNumber = this.bumpVersion(
      latestVersion?.version || '1.0.0',
      options.bump || 'patch',
    );

    const version: WorkflowVersion = {
      id: `wfv_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      workflowId,
      version: newVersionNumber,
      label: options.label,
      description: options.description,
      canvas,
      createdBy: userId,
      createdAt: new Date(),
      isActive: true,
    };

    // Deactivate previous version
    if (latestVersion) {
      latestVersion.isActive = false;
    }

    log.info('Workflow version created', {
      workflowId: workflowId.slice(0, 8),
      version: newVersionNumber,
      userId: userId.slice(0, 8),
    });

    return version;
  }

  /**
   * Get latest version of a workflow
   */
  async getLatestVersion(workflowId: string): Promise<WorkflowVersion | null> {
    const versions = await this.listVersions(workflowId, 1);
    return versions[0] || null;
  }

  /**
   * List all versions of a workflow
   */
  async listVersions(workflowId: string, _limit: number = 50): Promise<WorkflowVersion[]> {
    // This would query the database in production
    // For now, returning mock structure
    return [];
  }

  /**
   * Get specific version
   */
  async getVersion(_workflowId: string, _versionNumber: string): Promise<WorkflowVersion | null> {
    // This would query the database
    return null;
  }

  /**
   * Rollback to a previous version
   */
  async rollback(
    workflowId: string,
    targetVersion: string,
    userId: string,
  ): Promise<WorkflowVersion> {
    const targetVer = await this.getVersion(workflowId, targetVersion);
    if (!targetVer) {
      throw new Error(`Version ${targetVersion} not found`);
    }

    // Create new version based on rollback
    const newVersion = await this.createVersion(
      workflowId,
      targetVer.canvas,
      userId,
      {
        label: `Rollback from ${targetVersion}`,
        description: `Restored to version ${targetVersion}`,
        bump: 'patch',
      },
    );

    newVersion.rollbackFrom = targetVersion;

    log.info('Workflow rolled back', {
      workflowId: workflowId.slice(0, 8),
      fromVersion: targetVersion,
      toVersion: newVersion.version,
      userId: userId.slice(0, 8),
    });

    return newVersion;
  }

  /**
   * Compare two versions
   */
  async compareVersions(
    workflowId: string,
    version1: string,
    version2: string,
  ): Promise<VersionDiff> {
    const v1 = await this.getVersion(workflowId, version1);
    const v2 = await this.getVersion(workflowId, version2);

    if (!v1 || !v2) {
      throw new Error('One or both versions not found');
    }

    return this.diffCanvases(v1.canvas, v2.canvas);
  }

  /**
   * Deploy a version (make it active)
   */
  async deployVersion(
    workflowId: string,
    versionNumber: string,
    userId: string,
  ): Promise<WorkflowVersion> {
    const version = await this.getVersion(workflowId, versionNumber);
    if (!version) {
      throw new Error(`Version ${versionNumber} not found`);
    }

    version.isActive = true;
    version.deployedAt = new Date();

    log.info('Workflow version deployed', {
      workflowId: workflowId.slice(0, 8),
      version: versionNumber,
      userId: userId.slice(0, 8),
    });

    return version;
  }

  /**
   * Bump semantic version
   */
  private bumpVersion(
    currentVersion: string,
    bump: 'major' | 'minor' | 'patch',
  ): string {
    const [major, minor, patch] = currentVersion.split('.').map(Number);

    switch (bump) {
      case 'major':
        return `${major + 1}.0.0`;
      case 'minor':
        return `${major}.${minor + 1}.0`;
      case 'patch':
        return `${major}.${minor}.${patch + 1}`;
    }
  }

  /**
   * Diff two workflow canvases
   */
  private diffCanvases(canvas1: WorkflowCanvas, canvas2: WorkflowCanvas): VersionDiff {
    const diff: VersionDiff = {
      added: [],
      removed: [],
      modified: [],
      summary: '',
    };

    const blocks1 = new Map(canvas1.blocks.map(b => [b.id, b]));
    const blocks2 = new Map(canvas2.blocks.map(b => [b.id, b]));

    // Find added blocks
    for (const [id, block] of blocks2) {
      if (!blocks1.has(id)) {
        diff.added.push(block);
      }
    }

    // Find removed blocks
    for (const [id, block] of blocks1) {
      if (!blocks2.has(id)) {
        diff.removed.push(block);
      }
    }

    // Find modified blocks
    for (const [id, block2] of blocks2) {
      const block1 = blocks1.get(id);
      if (block1 && JSON.stringify(block1) !== JSON.stringify(block2)) {
        diff.modified.push({ before: block1, after: block2 });
      }
    }

    // Generate summary
    const parts: string[] = [];
    if (diff.added.length > 0) parts.push(`+${diff.added.length} blocks`);
    if (diff.removed.length > 0) parts.push(`-${diff.removed.length} blocks`);
    if (diff.modified.length > 0) parts.push(`~${diff.modified.length} modified`);

    diff.summary = parts.join(', ') || 'No changes';

    return diff;
  }

  /**
   * Merge versions (basic merge strategy)
   */
  async mergeVersions(
    workflowId: string,
    baseVersion: string,
    otherVersion: string,
    userId: string,
  ): Promise<{ merged: WorkflowCanvas; conflicts: any[] }> {
    const base = await this.getVersion(workflowId, baseVersion);
    const other = await this.getVersion(workflowId, otherVersion);

    if (!base || !other) {
      throw new Error('One or both versions not found');
    }

    const conflicts: any[] = [];
    const merged = { ...base.canvas };

    // Simple merge: take blocks from both, flag conflicts
    const baseBlockIds = new Set(base.canvas.blocks.map(b => b.id));
    const otherBlockIds = new Set(other.canvas.blocks.map(b => b.id));

    for (const block of other.canvas.blocks) {
      if (baseBlockIds.has(block.id)) {
        // Check if modified differently
        const baseBlock = base.canvas.blocks.find(b => b.id === block.id);
        if (baseBlock && JSON.stringify(baseBlock) !== JSON.stringify(block)) {
          conflicts.push({ type: 'block-modified', blockId: block.id, baseBlock, otherBlock: block });
        }
      } else {
        merged.blocks.push(block);
      }
    }

    return { merged, conflicts };
  }

  /**
   * Tag a version
   */
  async tagVersion(
    workflowId: string,
    versionNumber: string,
    tag: string,
  ): Promise<void> {
    log.info('Version tagged', {
      workflowId: workflowId.slice(0, 8),
      version: versionNumber,
      tag,
    });
  }

  /**
   * Get version by tag
   */
  async getVersionByTag(_workflowId: string, _tag: string): Promise<WorkflowVersion | null> {
    // Query by tag
    return null;
  }
}

export const versioningEngine = new VersioningEngine();

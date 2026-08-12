// ============================================================
// WORKFLOW VERSIONING — Branches, versions, merge, restore
// Historique complet type Git pour les workflows
// ============================================================

import { prisma, type FirestoreWhereOp } from '@/lib/prisma';
import { createLogger } from '@/lib/logger';
import type { WorkflowCanvas } from './workflow-engine';

const log = createLogger('workflow-versioning');

function whereEq(w: { field: string; op?: '==' | '>=' | '<='; value: unknown }): FirestoreWhereOp {
  return { field: w.field, op: w.op || '==', value: w.value };
}

export class WorkflowVersioning {
  /**
   * Crée un workflow avec sa branche main et version initiale
   */
  async createWithInitialVersion(workflowId: string, userId: string, steps: WorkflowCanvas, name: string = 'Version initiale') {
    const branch = await prisma.workflowBranch.create({
      data: { workflowId, name: 'main', description: 'Branche principale', isDefault: true, userId },
    });

    const version = await prisma.workflowVersion.create({
      data: { workflowId, branchId: branch.id, version: 1, steps: JSON.stringify(steps), name, message: name, userId },
    });

    await prisma.workflow.update({
      where: { id: workflowId },
      data: { activeBranchId: branch.id, currentVersionId: version.id },
    });

    return { branch, version };
  }

  /**
   * Sauvegarde une nouvelle version
   */
  async saveVersion(workflowId: string, userId: string, steps: WorkflowCanvas, message: string) {
    const workflow = await prisma.workflow.findUnique({
      where: { id: workflowId },
      select: ['activeBranchId', 'currentVersionId'],
    });
    if (!workflow?.activeBranchId) throw new Error('Aucune branche active');

    const lastVersion = await prisma.workflowVersion.findFirst({
      where: [
        whereEq({ field: 'workflowId', value: workflowId }),
        whereEq({ field: 'branchId', value: workflow.activeBranchId }),
      ],
      orderBy: [{ field: 'version', direction: 'desc' }],
      select: ['version', 'id'],
    });

    const newVersionNum = (lastVersion?.version as number || 0) + 1;
    const version = await prisma.workflowVersion.create({
      data: {
        workflowId, branchId: workflow.activeBranchId,
        version: newVersionNum, steps: JSON.stringify(steps),
        name: 'v' + newVersionNum, message, userId,
        parentVersionId: lastVersion?.id || null,
      },
    });

    await prisma.workflow.update({
      where: { id: workflowId },
      data: { currentVersionId: version.id, steps: JSON.stringify(steps) },
    });

    log.info('version_saved', { workflowId, branchId: workflow.activeBranchId, version: newVersionNum });
    return version;
  }

  /**
   * Crée une branche à partir d'une version
   */
  async createBranch(workflowId: string, userId: string, branchName: string, sourceVersionId?: string) {
    const workflow = await prisma.workflow.findUnique({
      where: { id: workflowId },
      select: ['currentVersionId'],
    });

    const sourceId = sourceVersionId || workflow?.currentVersionId;
    if (!sourceId) throw new Error('Aucune version source');

    const sourceVersion = await prisma.workflowVersion.findUnique({ where: { id: sourceId } });
    if (!sourceVersion) throw new Error('Version source introuvable');

    const branch = await prisma.workflowBranch.create({
      data: { workflowId, name: branchName, sourceBranchId: sourceVersion.branchId, userId },
    });

    const version = await prisma.workflowVersion.create({
      data: {
        workflowId, branchId: branch.id, version: 1,
        steps: sourceVersion.steps, name: branchName + ' v1',
        message: 'Branche creee depuis ' + sourceVersion.name, userId,
        parentVersionId: sourceId,
      },
    });

    await prisma.workflow.update({
      where: { id: workflowId },
      data: { activeBranchId: branch.id, currentVersionId: version.id },
    });

    log.info('branch_created', { workflowId, branchName });
    return { branch, version };
  }

  /**
   * Change de branche active
   */
  async switchBranch(workflowId: string, branchId: string) {
    const branch = await prisma.workflowBranch.findUnique({ where: { id: branchId } });
    if (!branch) throw new Error('Branche introuvable');

    const versions = await prisma.workflowVersion.findMany({
      where: [whereEq({ field: 'branchId', value: branchId })],
      orderBy: [{ field: 'version', direction: 'desc' }],
      limit: 1,
    });
    const latestVersion = versions[0];

    await prisma.workflow.update({
      where: { id: workflowId },
      data: { activeBranchId: branchId, currentVersionId: latestVersion?.id || undefined },
    });

    return { branch, steps: latestVersion ? JSON.parse(latestVersion.steps as string) : { blocks: [], edges: [] } };
  }

  /**
   * Restaure une version antérieure
   */
  async restoreVersion(workflowId: string, versionId: string) {
    const version = await prisma.workflowVersion.findUnique({ where: { id: versionId } });
    if (!version) throw new Error('Version introuvable');

    const newVersion = await this.saveVersion(workflowId, version.userId as string, JSON.parse(version.steps as string), 'Restauration: ' + version.name);
    log.info('version_restored', { workflowId, fromVersion: versionId, toVersion: newVersion.id });
    return newVersion;
  }

  /**
   * Merge une branche source dans la branche active
   */
  async mergeBranch(workflowId: string, sourceBranchId: string, userId: string) {
    const sourceBranch = await prisma.workflowBranch.findUnique({ where: { id: sourceBranchId } });
    if (!sourceBranch) throw new Error('Branche source introuvable');

    const workflow = await prisma.workflow.findUnique({
      where: { id: workflowId },
      select: ['activeBranchId', 'currentVersionId'],
    });

    const sourceVersions = await prisma.workflowVersion.findMany({
      where: [whereEq({ field: 'branchId', value: sourceBranchId })],
      orderBy: [{ field: 'version', direction: 'desc' }],
      limit: 1,
    });
    const sourceSteps = sourceVersions[0]?.steps || '{"blocks":[],"edges":[]}';

    const version = await this.saveVersion(workflowId, userId, JSON.parse(sourceSteps as string),
      'Merge: ' + sourceBranch.name + ' -> ' + (await this.getBranchName(workflowId, workflow?.activeBranchId || '')));

    log.info('branch_merged', { workflowId, sourceBranchId, targetBranchId: workflow?.activeBranchId });
    return version;
  }

  /**
   * Récupère l'historique complet d'un workflow
   */
  async getHistory(workflowId: string) {
    const branches = await prisma.workflowBranch.findMany({
      where: [whereEq({ field: 'workflowId', value: workflowId })],
      orderBy: [{ field: 'createdAt', direction: 'asc' }],
    });

    const allVersions = await prisma.workflowVersion.findMany({
      where: [whereEq({ field: 'workflowId', value: workflowId })],
      orderBy: [{ field: 'createdAt', direction: 'desc' }],
      limit: 50,
    });

    // include:{versions,take:1} + _count:{versions} calculés en mémoire
    const branchIds = branches.map((b) => String((b as Record<string, unknown>).id)).filter(Boolean);
    const versionsByBranch = allVersions.reduce<Record<string, unknown[]>>((acc, v) => {
      const bid = String((v as Record<string, unknown>).branchId || '');
      if (!acc[bid]) acc[bid] = [];
      acc[bid].push(v);
      return acc;
    }, {});

    const enrichedBranches = branches.map((b) => {
      const id = String((b as Record<string, unknown>).id);
      const vs = (versionsByBranch[id] || []);
      vs.sort((a, b2) => (Number((b2 as Record<string, unknown>).version) || 0) - (Number((a as Record<string, unknown>).version) || 0));
      return {
        ...b,
        versions: vs.slice(0, 1),
        _count: { versions: branchIds.includes(id) ? versionsByBranch[id]?.length || 0 : 0 },
      };
    });

    return { branches: enrichedBranches, allVersions };
  }

  private async getBranchName(workflowId: string, branchId: string): Promise<string> {
    const b = await prisma.workflowBranch.findUnique({ where: { id: branchId } });
    return (b?.name as string) || 'inconnue';
  }
}

export const workflowVersioning = new WorkflowVersioning();
export default workflowVersioning;

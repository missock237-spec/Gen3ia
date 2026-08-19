// ============================================================
// Skill Engine — Systeme de competences installables
// Les utilisateurs peuvent installer des competences sur leurs agents
// ============================================================

import { db } from '@/lib/db';
import { getCreditEngine } from '@/lib/billing/credit-engine';

const creditEngine = getCreditEngine();

// Types de competences
export type SkillCategory = 'reasoning' | 'code' | 'research' | 'writing' | 'analysis' | 'creative' | 'automation' | 'communication' | 'data' | 'custom';
export type SkillLevel = 'beginner' | 'intermediate' | 'advanced' | 'expert';
export type InstallTarget = 'agent' | 'workflow' | 'global';

// Interface d'une competence
export interface Skill {
  id: string;
  name: string;
  slug: string;
  description: string;
  category: SkillCategory;
  level: SkillLevel;
  icon: string;
  version: string;
  authorId: string;
  authorName?: string;
  price: number;
  isFree: boolean;
  isOfficial: boolean;
  tags: string[];
  // Configuration de la competence
  config: {
    promptTemplate?: string;
    systemPrompt?: string;
    tools?: string[];
    modelPreferences?: string[];
    parameters?: Record<string, unknown>;
    hooks?: string[];
  };
  // Compatibilite
  compatibleModels: string[];
  compatibleAgentTypes: string[];
  // Stats
  installCount: number;
  rating: number;
  reviewCount: number;
  status: 'draft' | 'published' | 'deprecated';
  createdAt: string;
  updatedAt: string;
}

// Interface d'une boucle IA (pattern d'execution)
export interface AILoop {
  id: string;
  name: string;
  slug: string;
  description: string;
  icon: string;
  version: string;
  authorId: string;
  authorName?: string;
  price: number;
  isFree: boolean;
  isOfficial: boolean;
  // Configuration de la boucle
  config: {
    maxIterations: number;
    maxTokens: number;
    temperature: number;
    stopOnResult: boolean;
    reflectionEnabled: boolean;
    tools: string[];
    promptTemplate: string;
    validationRules?: string[];
    outputSchema?: Record<string, unknown>;
  };
  tags: string[];
  installCount: number;
  rating: number;
  reviewCount: number;
  status: 'draft' | 'published' | 'deprecated';
  createdAt: string;
  updatedAt: string;
}

// Interface d'une personnalisation
export interface Customization {
  id: string;
  name: string;
  slug: string;
  description: string;
  type: 'theme' | 'prompt_template' | 'preset' | 'config_profile' | 'ui_pack';
  icon: string;
  version: string;
  authorId: string;
  authorName?: string;
  price: number;
  isFree: boolean;
  isOfficial: boolean;
  config: Record<string, unknown>;
  preview?: string;
  tags: string[];
  installCount: number;
  rating: number;
  reviewCount: number;
  status: 'draft' | 'published' | 'deprecated';
  createdAt: string;
  updatedAt: string;
}

export class SkillEngine {
  /**
   * Installer une competence sur un agent
   */
  async installSkillOnAgent(userId: string, skillId: string, agentId: string): Promise<{ success: boolean; message: string }> {
    const skill = await db.skill.findUnique({ where: { id: skillId } });
    if (!skill) return { success: false, message: 'Competence introuvable' };
    if (skill.status !== 'published') return { success: false, message: 'Competence non publiee' };

    // Verifier le prix
    if (!skill.isFree && skill.price > 0) {
      const user = await db.user.findUnique({ where: { id: userId }, select: { credits: true } });
      if (!user || user.credits < skill.price) {
        return { success: false, message: 'Credits insuffisants. Prix: ' + skill.price + ' credits' };
      }
      await creditEngine.deductCredits(userId, { credits: skill.price, usdCost: 0, breakdown: [] }, {
        action: 'skill_purchase', category: 'tool_execution', resourceId: skillId,
      });
    }

    // Enregistrer l'installation
    await db.agentSkill.create({ data: { agentId, skillId, userId, config: JSON.stringify(skill.config), enabled: true } });
    await db.skill.update({ where: { id: skillId }, data: { installCount: { increment: 1 } } });

    return { success: true, message: 'Competence "' + skill.name + '" installee sur l\'agent' };
  }

  /**
   * Installer une boucle IA sur un agent
   */
  async installLoopOnAgent(userId: string, loopId: string, agentId: string): Promise<{ success: boolean; message: string }> {
    const loop = await db.aILoop.findUnique({ where: { id: loopId } });
    if (!loop) return { success: false, message: 'Boucle IA introuvable' };
    if (loop.status !== 'published') return { success: false, message: 'Boucle non publiee' };

    if (!loop.isFree && loop.price > 0) {
      const user = await db.user.findUnique({ where: { id: userId }, select: { credits: true } });
      if (!user || user.credits < loop.price) {
        return { success: false, message: 'Credits insuffisants. Prix: ' + loop.price + ' credits' };
      }
      await creditEngine.deductCredits(userId, { credits: loop.price, usdCost: 0, breakdown: [] }, {
        action: 'loop_purchase', category: 'tool_execution', resourceId: loopId,
      });
    }

    await db.agentLoop.create({ data: { agentId, loopId, userId, config: JSON.stringify(loop.config), enabled: true } });
    await db.aILoop.update({ where: { id: loopId }, data: { installCount: { increment: 1 } } });

    return { success: true, message: 'Boucle IA "' + loop.name + '" installee sur l\'agent' };
  }

  /**
   * Appliquer une personnalisation
   */
  async applyCustomization(userId: string, customizationId: string, targetId?: string): Promise<{ success: boolean; message: string; config?: any }> {
    const cust = await db.customization.findUnique({ where: { id: customizationId } });
    if (!cust) return { success: false, message: 'Personnalisation introuvable' };

    if (!cust.isFree && cust.price > 0) {
      const user = await db.user.findUnique({ where: { id: userId }, select: { credits: true } });
      if (!user || user.credits < cust.price) {
        return { success: false, message: 'Credits insuffisants' };
      }
      await creditEngine.deductCredits(userId, { credits: cust.price, usdCost: 0, breakdown: [] }, {
        action: 'customization_purchase', category: 'tool_execution', resourceId: customizationId,
      });
    }

    await db.userCustomization.create({ data: { userId, customizationId, targetId: targetId || null, config: JSON.stringify(cust.config), enabled: true } });
    await db.customization.update({ where: { id: customizationId }, data: { installCount: { increment: 1 } } });

    return { success: true, message: 'Personnalisation "' + cust.name + '" appliquee', config: cust.config };
  }

  /**
   * Desinstaller une competence
   */
  async uninstallSkill(agentSkillId: string): Promise<boolean> {
    const agSkill = await db.agentSkill.findUnique({ where: { id: agentSkillId } });
    if (!agSkill) return false;
    await db.agentSkill.delete({ where: { id: agentSkillId } });
    return true;
  }

  /**
   * Desinstaller une boucle
   */
  async uninstallLoop(agentLoopId: string): Promise<boolean> {
    const agLoop = await db.agentLoop.findUnique({ where: { id: agentLoopId } });
    if (!agLoop) return false;
    await db.agentLoop.delete({ where: { id: agentLoopId } });
    return true;
  }

  /**
   * Lister les competences installees sur un agent
   */
  async getAgentSkills(agentId: string): Promise<unknown[]> {
    return db.agentSkill.findMany({ where: { agentId }, include: { skill: true }, orderBy: { createdAt: 'desc' } });
  }

  /**
   * Lister les boucles installees sur un agent
   */
  async getAgentLoops(agentId: string): Promise<unknown[]> {
    return db.agentLoop.findMany({ where: { agentId }, include: { loop: true }, orderBy: { createdAt: 'desc' } });
  }

  /**
   * Lister les personnalisations d'un utilisateur
   */
  async getUserCustomizations(userId: string): Promise<unknown[]> {
    return db.userCustomization.findMany({ where: { userId }, include: { customization: true }, orderBy: { createdAt: 'desc' } });
  }

  /**
   * Creer une nouvelle competence
   */
  async createSkill(data: Partial<Skill> & { name: string; category: SkillCategory }): Promise<unknown> {
    return db.skill.create({
      data: {
        name: data.name, slug: data.slug || data.name.toLowerCase().replace(/\s+/g, '-'),
        description: data.description || '', category: data.category, level: data.level || 'intermediate',
        icon: data.icon || '🧩', version: data.version || '1.0.0',
        authorId: data.authorId || '', authorName: data.authorName,
        price: data.price || 0, isFree: data.isFree ?? true, isOfficial: data.isOfficial ?? false,
        tags: data.tags || [], config: JSON.stringify(data.config || {}),
        compatibleModels: data.compatibleModels || [], compatibleAgentTypes: data.compatibleAgentTypes || [],
        status: 'draft',
      },
    });
  }

  /**
   * Creer une nouvelle boucle IA
   */
  async createLoop(data: Partial<AILoop> & { name: string }): Promise<unknown> {
    return db.aILoop.create({
      data: {
        name: data.name, slug: data.slug || data.name.toLowerCase().replace(/\s+/g, '-'),
        description: data.description || '', icon: data.icon || '🔄', version: data.version || '1.0.0',
        authorId: data.authorId || '', authorName: data.authorName,
        price: data.price || 0, isFree: data.isFree ?? true, isOfficial: data.isOfficial ?? false,
        tags: data.tags || [], config: JSON.stringify(data.config || {}),
        status: 'draft',
      },
    });
  }

  /**
   * Publier une competence/boucle/perso
   */
  async publish(itemType: 'skill' | 'loop' | 'customization', itemId: string): Promise<boolean> {
    const model = itemType === 'skill' ? db.skill : itemType === 'loop' ? db.aILoop : db.customization;
    await model.update({ where: { id: itemId }, data: { status: 'published' } });
    return true;
  }
}

let instance: SkillEngine | null = null;
export function getSkillEngine(): SkillEngine {
  if (!instance) instance = new SkillEngine();
  return instance;
}

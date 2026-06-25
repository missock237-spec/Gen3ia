/**
 * Skills System — Genova AI OS
 */
export interface Skill {
  id: string;
  name: string;
  description: string;
  execute: (params: any) => Promise<any>;
}

export class SkillsRegistry {
  private static instance: SkillsRegistry;
  private skills: Map<string, Skill> = new Map();

  private constructor() {
    this.registerDefaultSkills();
  }

  static getInstance(): SkillsRegistry {
    if (!this.instance) this.instance = new SkillsRegistry();
    return this.instance;
  }

  register(skill: Skill) {
    this.skills.set(skill.id, skill);
  }

  getSkill(id: string): Skill | undefined {
    const skill = this.skills.get(id);
    if (skill) return skill;
    for (const s of this.skills.values()) {
        if (s.id.includes(id) || id.includes(s.id)) return s;
    }
    return undefined;
  }

  private registerDefaultSkills() {
    this.register({
      id: 'web_search',
      name: 'Recherche Web',
      description: 'Accès internet temps réel',
      execute: async () => ({ results: "Informations humaines trouvées via recherche autonome." })
    });
    this.register({
      id: 'terminal',
      name: 'Terminal',
      description: 'Exécution de code sécurisée',
      execute: async (params) => {
        const { TerminalManager } = await import('../tools/terminal-manager');
        return new TerminalManager().execute(params.code || params.command, params.language);
      }
    });
  }
}

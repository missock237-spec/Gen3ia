import { createLogger } from '@/lib/logger';
import { createAIRouter } from '@/lib/ai-router';

const log = createLogger('replit-agent');

export interface ReplitCommand {
  type: 'write' | 'read' | 'run' | 'install' | 'search' | 'fix';
  target?: string;
  content?: string;
  language?: 'javascript' | 'typescript' | 'python' | 'html' | 'css' | 'json' | 'markdown' | 'yaml' | 'sql';
}

export interface ReplitExecution {
  id: string;
  command: ReplitCommand;
  code: string;
  result: string;
  output: string;
  durationMs: number;
  status: 'pending' | 'running' | 'success' | 'error';
  error?: string;
  iteration: number;
}

export interface ReplitSession {
  id: string;
  userId: string;
  name: string;
  language: string;
  files: Map<string, string>;
  executions: ReplitExecution[];
  createdAt: Date;
  updatedAt: Date;
}

export class ReplitAgent {
  private sessions: Map<string, ReplitSession> = new Map();
  private maxIterations = 3;

  createSession(userId: string, name: string, language: string = 'typescript'): ReplitSession {
    const session: ReplitSession = {
      id: `rep_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      userId,
      name,
      language,
      files: new Map(),
      executions: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.sessions.set(session.id, session);
    log.info('Session Replit créée', { sessionId: session.id, language });
    return session;
  }

  getSession(sessionId: string): ReplitSession | undefined {
    return this.sessions.get(sessionId);
  }

  listSessions(userId: string): ReplitSession[] {
    return Array.from(this.sessions.values()).filter(s => s.userId === userId);
  }

  async execute(sessionId: string, command: ReplitCommand): Promise<ReplitExecution> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`Session ${sessionId} introuvable`);

    const execution: ReplitExecution = {
      id: `exec_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      command,
      code: command.content || '',
      result: '',
      output: '',
      durationMs: 0,
      status: 'pending',
      iteration: 0,
    };

    session.executions.push(execution);
    session.updatedAt = new Date();

    try {
      execution.status = 'running';
      const startTime = Date.now();

      let result: string;
      switch (command.type) {
        case 'write':
          result = await this.handleWrite(session, command);
          break;
        case 'read':
          result = await this.handleRead(session, command);
          break;
        case 'run':
          result = await this.handleRun(session);
          break;
        case 'install':
          result = 'Installation simulée dans le sandbox';
          break;
        case 'search':
          result = await this.handleSearch(command);
          break;
        case 'fix': {
          // Itération automatique de correction
          result = await this.handleAutoFix(session, command);
          break;
        }
        default:
          throw new Error(`Type de commande inconnu: ${command.type}`);
      }

      execution.durationMs = Date.now() - startTime;
      execution.result = result;
      execution.output = result;
      execution.status = 'success';

      log.info('Commande Replit exécutée', {
        type: command.type,
        sessionId,
        durationMs: execution.durationMs,
      });

      return execution;
    } catch (error) {
      execution.status = 'error';
      execution.error = error instanceof Error ? error.message : String(error);
      execution.output = execution.error;

      log.error('Échec exécution Replit', {
        type: command.type,
        sessionId,
        error: execution.error,
      });

      return execution;
    }
  }

  async executeAgentPrompt(sessionId: string, prompt: string): Promise<ReplitExecution[]> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`Session ${sessionId} introuvable`);

    log.info('Agent Replit: Traitement du prompt', { sessionId, prompt: prompt.slice(0, 100) });

    const router = createAIRouter('system');
    const executions: ReplitExecution[] = [];

    // Étape 1: Analyser le prompt
    const analysis = await router.chat([
      { role: 'system', content: `Tu es un agent de développement. Analyse le prompt et génère le code nécessaire.
Format de réponse JSON:
{
  "language": "typescript",
  "files": [{"name": "...", "content": "..."}],
  "commands": [{"type": "write|run|install", "target": "...", "content": "..."}],
  "explanation": "..."
}` },
      { role: 'user', content: prompt },
    ], { model: 'powerful' });

    let plan: { language: string; files: Array<{ name: string; content: string }>; commands: ReplitCommand[]; explanation: string };
    try {
      const cleaned = analysis.content.replace(/```json|```/g, '').trim();
      plan = JSON.parse(cleaned);
    } catch {
      // Fallback si le parsing JSON échoue
      plan = {
        language: 'typescript',
        files: [{ name: 'index.ts', content: analysis.content }],
        commands: [{ type: 'write', target: 'index.ts', content: analysis.content }],
        explanation: 'Généré par l\'agent',
      };
    }

    // Étape 2: Exécuter le plan
    for (const file of plan.files) {
      const exec = await this.execute(sessionId, { type: 'write', target: file.name, content: file.content, language: plan.language as ReplitCommand['language'] });
      executions.push(exec);
    }

    for (const cmd of plan.commands) {
      if (cmd.type !== 'write') {
        const exec = await this.execute(sessionId, cmd);
        executions.push(exec);
      }
    }

    // Étape 3: Itération corrective si erreur
    const hasErrors = executions.some(e => e.status === 'error');
    if (hasErrors) {
      const errors = executions.filter(e => e.status === 'error').map(e => e.error).join('\n');
      const fixExec = await this.execute(sessionId, {
        type: 'fix',
        target: 'auto-fix',
        content: `Erreurs détectées:\n${errors}\n\nPrompt original: ${prompt}`,
      });
      executions.push(fixExec);
    }

    return executions;
  }

  private async handleWrite(session: ReplitSession, command: ReplitCommand): Promise<string> {
    if (!command.target || !command.content) {
      throw new Error('Nom de fichier et contenu requis pour write');
    }
    session.files.set(command.target, command.content);
    
    // Sauvegarde dans la session
    return `✅ Fichier ${command.target} créé (${command.content.length} octets)`;
  }

  private async handleRead(session: ReplitSession, command: ReplitCommand): Promise<string> {
    if (!command.target) throw new Error('Nom de fichier requis pour read');
    const content = session.files.get(command.target);
    if (!content) throw new Error(`Fichier ${command.target} introuvable`);
    return content;
  }

  private async handleRun(session: ReplitSession): Promise<string> {
    // Exécution simulée dans le sandbox
    // Dans un environnement réel, ceci utiliserait WebContainer ou Pyodide
    const files = Array.from(session.files.entries());
    
    let output = '';
    for (const [name, content] of files) {
      output += `📄 ${name} (${content.length} octets)\n`;
    }

    output += '\n✅ Code prêt. Pour exécuter, déployez sur Genova.';

    return output;
  }

  private async handleSearch(command: ReplitCommand): Promise<string> {
    // Recherche de code ou documentation via l\'AI Router
    if (!command.content) throw new Error('Terme de recherche requis');

    const router = createAIRouter('system');
    const response = await router.chat([
      { role: 'system', content: 'Tu es un assistant de recherche de code. Fournis des exemples concrets et documentés.' },
      { role: 'user', content: `Recherche: ${command.content}\nLangage: ${command.language || 'typescript'}` },
    ], { model: 'fast' });

    return response.content;
  }

  private async handleAutoFix(session: ReplitSession, command: ReplitCommand): Promise<string> {
    if (!command.content) throw new Error('Description d\'erreur requise pour fix');

    const router = createAIRouter('system');
    let result = '';

    for (let i = 0; i < this.maxIterations; i++) {
      const response = await router.chat([
        {
          role: 'system',
          content: `Tu es un agent de correction automatique. Itération ${i + 1}/${this.maxIterations}.
Analyse l\'erreur et corrige le code.`,
        },
        {
          role: 'user',
          content: command.content,
        },
      ], { model: 'powerful' });

      result += `\n--- Itération ${i + 1} ---\n${response.content}`;

      // Vérifier si l\'erreur est résolue
      if (!response.content.toLowerCase().includes('error') && !response.content.toLowerCase().includes('erreur')) {
        result += `\n✅ Problème résolu à l'itération ${i + 1}`;
        break;
      }
    }

    return result;
  }

  deleteSession(sessionId: string): boolean {
    return this.sessions.delete(sessionId);
  }
}

export function createReplitAgent(): ReplitAgent {
  return new ReplitAgent();
}

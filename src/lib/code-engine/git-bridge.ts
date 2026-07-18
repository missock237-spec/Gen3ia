/**
 * Git Bridge — Integration GitHub pour les agents de code
 * 
 * Permet aux agents de :
 * - Lire les fichiers d'un repo
 * - Creer des commits et PR
 * - Synchroniser les sessions avec des branches
 * - Analyser le code existant
 */

import { log } from './logger';

interface GitHubConfig {
  token: string;
  owner: string;
  repo: string;
  branch?: string;
}

interface GitFile {
  path: string;
  content: string;
  sha?: string;
  size: number;
}

interface GitCommit {
  sha: string;
  message: string;
  author: { name: string; email: string };
  date: string;
}

interface GitPR {
  number: number;
  title: string;
  body: string;
  state: 'open' | 'closed' | 'merged';
  html_url: string;
  createdAt: string;
}

class GitBridge {
  private repos = new Map<string, GitHubConfig>();

  /**
   * Connecte un depot GitHub
   */
  connect(userId: string, token: string, owner: string, repo: string, branch?: string): void {
    this.repos.set(userId, { token, owner, repo, branch: branch || 'main' });
    log.system.info('GitHub connecte: ' + owner + '/' + repo);
  }

  /**
   * Lit un fichier depuis GitHub
   */
  async readFile(userId: string, path: string): Promise<GitFile | null> {
    const config = this.repos.get(userId);
    if (!config) throw new Error('Aucun depot GitHub connecte');

    try {
      const response = await fetch(
        `https://api.github.com/repos/${config.owner}/${config.repo}/contents/${path}?ref=${config.branch}`,
        {
          headers: {
            Authorization: 'Bearer ' + config.token,
            Accept: 'application/vnd.github.v3+json',
          },
        }
      );

      if (!response.ok) {
        if (response.status === 404) return null;
        throw new Error('GitHub API error: ' + response.status);
      }

      const data = await response.json();
      return {
        path: data.path,
        content: Buffer.from(data.content, 'base64').toString('utf-8'),
        sha: data.sha,
        size: data.size,
      };
    } catch (error) {
      log.system.error('Erreur lecture fichier GitHub', { path, error });
      return null;
    }
  }

  /**
   * Liste les fichiers d'un dossier
   */
  async listFiles(userId: string, path: string = ''): Promise<{ name: string; path: string; type: 'file' | 'dir' }[]> {
    const config = this.repos.get(userId);
    if (!config) throw new Error('Aucun depot GitHub connecte');

    try {
      const response = await fetch(
        `https://api.github.com/repos/${config.owner}/${config.repo}/contents/${path}?ref=${config.branch}`,
        { headers: { Authorization: 'Bearer ' + config.token, Accept: 'application/vnd.github.v3+json' } }
      );

      if (!response.ok) return [];
      const data = await response.json();
      return Array.isArray(data) ? data.map((f: { name: string; path: string; type: string }) => ({
        name: f.name,
        path: f.path,
        type: f.type as 'file' | 'dir',
      })) : [];
    } catch {
      return [];
    }
  }

  /**
   * Cree un commit sur GitHub
   */
  async createCommit(userId: string, path: string, content: string, message: string): Promise<GitCommit | null> {
    const config = this.repos.get(userId);
    if (!config) throw new Error('Aucun depot GitHub connecte');

    try {
      // Verifier si le fichier existe deja
      const existing = await this.readFile(userId, path);

      const body: Record<string, unknown> = {
        message,
        content: Buffer.from(content).toString('base64'),
        branch: config.branch,
      };

      if (existing?.sha) body.sha = existing.sha;

      const response = await fetch(
        `https://api.github.com/repos/${config.owner}/${config.repo}/contents/${path}`,
        {
          method: 'PUT',
          headers: {
            Authorization: 'Bearer ' + config.token,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        }
      );

      if (!response.ok) throw new Error('GitHub API error: ' + response.status);
      const data = await response.json();

      log.system.success('Commit cree: ' + path);
      return {
        sha: data.commit?.sha || '',
        message,
        author: { name: 'Genova Agent', email: 'agent@genova.io' },
        date: new Date().toISOString(),
      };
    } catch (error) {
      log.system.error('Erreur creation commit', { path, error });
      return null;
    }
  }

  /**
   * Cree une Pull Request
   */
  async createPR(userId: string, title: string, body: string, head: string, base: string = 'main'): Promise<GitPR | null> {
    const config = this.repos.get(userId);
    if (!config) throw new Error('Aucun depot GitHub connecte');

    try {
      const response = await fetch(
        `https://api.github.com/repos/${config.owner}/${config.repo}/pulls`,
        {
          method: 'POST',
          headers: {
            Authorization: 'Bearer ' + config.token,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ title, body, head, base }),
        }
      );

      if (!response.ok) throw new Error('GitHub API error: ' + response.status);
      const data = await response.json();

      log.system.success('PR creee: ' + title);
      return {
        number: data.number,
        title: data.title,
        body: data.body || '',
        state: data.state,
        html_url: data.html_url,
        createdAt: data.created_at,
      };
    } catch (error) {
      log.system.error('Erreur creation PR', { title, error });
      return null;
    }
  }

  /**
   *** Analyse le code d'un repo et propose des ameliorations
   */
  async analyzeRepo(userId: string): Promise<{ files: number; issues: string[]; suggestions: string[] }> {
    const config = this.repos.get(userId);
    if (!config) throw new Error('Aucun depot GitHub connecte');

    const srcFiles = await this.listFiles(userId, 'src');
    const tsFiles = srcFiles.filter(f => f.type === 'file' && (f.name.endsWith('.ts') || f.name.endsWith('.tsx')));

    const issues: string[] = [];
    const suggestions: string[] = [];

    for (const file of tsFiles.slice(0, 10)) {
      const content = await this.readFile(userId, file.path);
      if (!content) continue;

      if (content.content.includes('any')) {
        issues.push(file.path + ': contient des types any');
        suggestions.push('Remplacer any par des types specifiques');
      }
      if (content.content.includes('console.log')) {
        suggestions.push(file.path + ': remplacer console.log par un logger');
      }
      if (!content.content.includes('try') && content.content.includes('async')) {
        issues.push(file.path + ': fonctions async sans try/catch');
        suggestions.push('Ajouter une gestion d\'erreur');
      }
    }

    return {
      files: tsFiles.length,
      issues,
      suggestions,
    };
  }

  /**
   * Verifie si un depot est connecte
   */
  isConnected(userId: string): boolean {
    return this.repos.has(userId);
  }

  /**
   * Deconnecte un depot
   */
  disconnect(userId: string): void {
    this.repos.delete(userId);
    log.system.info('GitHub deconnecte pour ' + userId);
  }
}

export const gitBridge = new GitBridge();
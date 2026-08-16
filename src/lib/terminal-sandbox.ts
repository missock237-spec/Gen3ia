import { execFileSync } from 'child_process';
import { writeFileSync, readFileSync, unlinkSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

const WORKSPACE = '/tmp/gen3ia-workspace';
const SAFE_ENV_VARS = ['HOME', 'USER', 'PATH', 'PWD', 'SHELL', 'NODE_ENV'];

const ALLOWED = new Set(['echo','pwd','date','whoami','uname','ls','head','tail','wc','sort','clear','help','version','gen3ia','cat','create','write','edit','read','view','delete','rm']);
const VIRTUAL = new Set(['clear','help','version','gen3ia','create','write','edit','read','view','delete','rm']);

function resolvePath(input: string): string | null {
  const clean = input.trim().replace(/^~\//, '').replace(/^\.\//, '');
  if (clean.startsWith('/') || clean.includes('..') || /^\/(etc|proc|sys|usr|var)/.test(clean)) return null;
  return join(WORKSPACE, clean);
}

export function executeCommand(command: string): { output: string; success: boolean } {
  const trimmed = command.trim();
  const base = trimmed.split(' ')[0]?.toLowerCase() || '';
  const args = trimmed.slice(base.length).trim();
  if (!ALLOWED.has(base)) return { output: `Commande non autorisee: ${base}`, success: false };

  if (VIRTUAL.has(base)) {
    if (base === 'help' || base === 'clear') return { output: 'Terminal sandbox. Commandes: echo, pwd, date, ls, cat, create, edit, read, delete', success: true };
    if (base === 'version' || base === 'gen3ia') return { output: 'Gen3ia v1.0', success: true };
    if ((base === 'create' || base === 'write') && args) {
      const fp = join(WORKSPACE, args); mkdirSync(fp.substring(0, fp.lastIndexOf('/')), { recursive: true });
      writeFileSync(fp, '// ' + args + '\n', 'utf-8');
      return { output: 'Cree: ' + args, success: true };
    }
    if ((base === 'read' || base === 'view' || base === 'cat') && args) {
      const fp = resolvePath(args);
      if (!fp || !existsSync(fp)) return { output: 'Fichier introuvable', success: false };
      return { output: readFileSync(fp, 'utf-8').substring(0, 10000), success: true };
    }
    if ((base === 'delete' || base === 'rm') && args) {
      const fp = resolvePath(args);
      if (!fp || !existsSync(fp)) return { output: 'Fichier introuvable', success: false };
      unlinkSync(fp);
      return { output: 'Supprime', success: true };
    }
    if (base === 'edit') {
      const parts = trimmed.split(' ');
      if (parts.length < 3) return { output: 'Usage: edit <chemin> <contenu>', success: false };
      const fp = resolvePath(parts[1]);
      if (!fp) return { output: 'Chemin invalide', success: false };
      mkdirSync(fp.substring(0, fp.lastIndexOf('/')), { recursive: true });
      writeFileSync(fp, parts.slice(2).join(' '), 'utf-8');
      return { output: 'Modifie', success: true };
    }
    return { output: 'Usage: create <fichier>, read <fichier>, delete <fichier>', success: true };
  }

  try {
    if (base === 'env') {
      return { output: SAFE_ENV_VARS.map(k => `${k}=${process.env[k] || ''}`).join('\n'), success: true };
    }
    if (args.includes('| bash') || args.includes('| sh') || args.includes('| /bin/sh') || args.includes('`') || args.includes('$(')) {
      return { output: 'Pipes vers shell bloques', success: false };
    }
    const cmdParts = trimmed.split(/\s+/);
    const result = execFileSync(cmdParts[0], cmdParts.slice(1), { cwd: WORKSPACE, timeout: 3000, maxBuffer: 50 * 1024, encoding: 'utf-8' });
    return { output: (result || '').substring(0, 5000), success: true };
  } catch (e: any) {
    return { output: 'Erreur: ' + (e.stderr?.substring(0, 2000) || e.message?.substring(0, 500) || 'Echec'), success: false };
  }
}

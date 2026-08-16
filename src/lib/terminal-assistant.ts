// ============================================================
// TERMINAL ASSISTANT — Mode assisté intelligent
// Analyse, explique et sécurise les commandes avant exécution
// ============================================================

import { createLogger } from './logger';

const log = createLogger('terminal-assistant');

export type CommandRisk = 'safe' | 'warning' | 'dangerous' | 'critical';

export interface CommandAnalysis {
  command: string;
  risk: CommandRisk;
  explanation: string;
  alternatives: string[];
  warnings: string[];
  estimatedImpact: string;
  requiresConfirmation: boolean;
}

// ============================================================
// RÈGLES DE SÉCURITÉ
// ============================================================

const DANGEROUS_PATTERNS: { pattern: RegExp; risk: CommandRisk; warning: string; alternative?: string }[] = [
  { pattern: /rm\s+-rf\s+\//, risk: 'critical', warning: 'Supprime tout le système de fichiers !', alternative: 'rm -rf ./chemin (limité au répertoire courant)' },
  { pattern: /rm\s+-rf\s+~/, risk: 'critical', warning: 'Supprime tout votre répertoire personnel !', alternative: 'rm -rf ./chemin' },
  { pattern: /mkfs\./, risk: 'critical', warning: 'Formate un disque — perte de données garantie', alternative: 'Utilisez un outil de partitionnement' },
  { pattern: /dd\s+if=/, risk: 'dangerous', warning: 'Écriture brute sur un périphérique', alternative: 'cp ou rsync pour copier des fichiers' },
  { pattern: /chmod\s+777/, risk: 'warning', warning: 'Permissions trop permissives (777)', alternative: 'chmod 755 (exécutable) ou 644 (fichier)' },
  { pattern: /chown\s+-R/, risk: 'warning', warning: 'Change récursivement le propriétaire', alternative: 'chown user:group chemin (sans -R si possible)' },
  { pattern: /curl\s+.*\|\s*bash/, risk: 'critical', warning: 'Télécharge et exécute un script depuis une URL !', alternative: 'curl -O url && nano script && bash script' },
  { pattern: /wget\s+.*\-O\s*-\s*\|\s*bash/, risk: 'critical', warning: 'Pipe direct vers bash depuis une URL', alternative: 'Téléchargez d\'abord, inspectez, puis exécutez' },
  { pattern: /sudo\s+rm/, risk: 'dangerous', warning: 'Suppression avec privilèges root', alternative: 'Vérifiez le chemin avant d\'utiliser sudo' },
  { pattern: />(\s*)\/(dev|proc|sys)/, risk: 'critical', warning: 'Écriture vers un périphérique système', alternative: 'Redirigez vers un fichier normal' },
  { pattern: /passwd/, risk: 'warning', warning: 'Changera le mot de passe', alternative: '' },
  { pattern: /userdel|groupdel/, risk: 'dangerous', warning: 'Supprime un utilisateur ou groupe', alternative: 'useradd -D pour désactiver' },
  { pattern: /init\s+0|reboot|shutdown/, risk: 'dangerous', warning: 'Commande système critique', alternative: '' },
  { pattern: /killall|kill\s+-9/, risk: 'warning', warning: 'Tue des processus de force', alternative: 'kill -15 (SIGTERM) d\'abord' },
  { pattern: /:(){ :\|:& };:/, risk: 'critical', warning: 'Bombe fork — plante le système !', alternative: 'Ne JAMAIS exécuter cette commande' },
  { pattern: /\/dev\/null/, risk: 'warning', warning: 'Redirige vers /dev/null (données perdues)', alternative: '' },
];

const EXPLAINED_COMMANDS: Record<string, string> = {
  ls: 'Liste le contenu du répertoire. Options: -l (détaillé), -a (cachés), -h (lisible)',
  cd: 'Change le répertoire courant. cd .. revient au parent, cd ~ va au home',
  cat: 'Affiche le contenu d\'un fichier. Pour les longs fichiers, utilisez less ou head',
  grep: 'Recherche un motif dans un texte. grep -r pour récursif, grep -i insensible à la casse',
  find: 'Cherche des fichiers. find . -name "*.ts" trouve tous les fichiers TypeScript',
  ps: 'Liste les processus. ps aux pour tous, ps -ef pour format complet',
  top: 'Moniteur de processus interactif. Appuyez sur q pour quitter',
  df: 'Espace disque disponible. df -h pour format lisible',
  du: 'Estimation de l\'espace utilisé. du -sh * pour chaque dossier',
  chmod: 'Change les permissions. u=rwx (user), g=rx (groupe), o=r (autres)',
  tar: 'Archive des fichiers. tar -czf archive.tar.gz dossier/ pour compresser',
  ssh: 'Connexion distante sécurisée. ssh user@host -p port',
  scp: 'Copie sécurisée entre machines. scp fichier user@host:chemin',
  rsync: 'Synchronisation de fichiers. rsync -avz source/ destination/',
  docker: 'Gestion des conteneurs. docker ps, docker-compose up -d',
  git: 'Contrôle de version. git status, git add, git commit -m, git push',
  npm: 'Gestionnaire de paquets Node. npm install, npm run build',
  pnpm: 'Alternative plus rapide à npm. pnpm install, pnpm dev',
  curl: 'Transfert de données depuis/vers une URL. curl -O url pour télécharger',
  wget: 'Téléchargement depuis une URL. wget -O fichier url',
  sed: 'Éditeur de flux. sed -i "s/ancien/nouveau/g" fichier',
  awk: 'Traitement de texte avancé. awk "{print \$1}" fichier',
};

const EDITOR_COMMANDS = ['nano', 'vim', 'vi', 'code', 'code-insiders', 'emacs', 'nvi'];

// ============================================================
// SERVICE D'ANALYSE
// ============================================================

class TerminalAssistant {
  /**
   * Analyse complète d'une commande
   */
  analyze(command: string): CommandAnalysis {
    const trimmed = command.trim();
    const baseCmd = trimmed.split(/\s+/)[0] || '';
    const warnings: string[] = [];
    let risk: CommandRisk = 'safe';
    let alternative: string | undefined;

    // 1. Détection des patterns dangereux
    for (const rule of DANGEROUS_PATTERNS) {
      if (rule.pattern.test(trimmed)) {
        warnings.push(rule.warning);
        if (rule.risk === 'critical' || rule.risk === 'dangerous') {
          risk = rule.risk;
        } else if (risk === 'safe') {
          risk = rule.risk;
        }
        if (rule.alternative && !alternative) {
          alternative = rule.alternative;
        }
      }
    }

    // 2. Vérification des pipes vers bash
    if (/\|\s*(bash|sh)\s*$/.test(trimmed)) {
      warnings.push('Le pipe vers bash exécute le résultat comme du code. Vérifiez le contenu avant.');
      if (risk === 'safe') risk = 'warning';
    }

    // 3. Détection des éditeurs (bloquants en terminal non-interactif)
    if (EDITOR_COMMANDS.includes(baseCmd)) {
      warnings.push(`L'éditeur ${baseCmd} nécessite un terminal interactif. Utilisez plutôt sed ou echo pour éditer.`);
    }

    // 4. Détection de commandes destructrices avec rm
    if (/^rm\s+/.test(trimmed) && !/rm\s+-rf\s+\//.test(trimmed)) {
      if (!trimmed.includes('-i') && !trimmed.includes('-I')) {
        warnings.push('Sans -i ou -I, rm ne demandera pas de confirmation.');
        if (risk === 'safe') risk = 'warning';
      }
    }

    // 5. Détection de commandes dangereuses avec curl/wget
    if ((baseCmd === 'curl' || baseCmd === 'wget') && !trimmed.includes('-O') && !trimmed.includes('-o')) {
      warnings.push('Le résultat sera affiché dans le terminal. Utilisez -O pour télécharger.');
    }

    // 6. Explication de la commande
    const explanation = EXPLAINED_COMMANDS[baseCmd]
      ? `${baseCmd}: ${EXPLAINED_COMMANDS[baseCmd]}`
      : this.guessExplanation(trimmed);

    // 7. Suggérer des alternatives sûres
    const alternatives: string[] = [];
    if (alternative) alternatives.push(alternative);
    if (baseCmd === 'rm' && risk !== 'critical') {
      alternatives.push('Ajoutez -i pour confirmation: rm -i ' + trimmed.slice(3));
    }
    if (baseCmd === 'chmod' && /777/.test(trimmed)) {
      alternatives.push('chmod 755 ' + trimmed.replace(/777/g, '755'));
    }

    // 8. Impact estimé
    const estimatedImpact = this.estimateImpact(trimmed, risk);

    return {
      command: trimmed,
      risk,
      explanation,
      alternatives,
      warnings,
      estimatedImpact,
      requiresConfirmation: risk === 'dangerous' || risk === 'critical',
    };
  }

  /**
   * Suggère des alternatives à une commande
   */
  suggestSafeAlternative(command: string): string | null {
    const analysis = this.analyze(command);
    if (analysis.alternatives.length > 0) {
      return analysis.alternatives[0];
    }
    return null;
  }

  /**
   * Estime l'impact d'une commande
   */
  private estimateImpact(command: string, risk: CommandRisk): string {
    if (risk === 'critical') return '💀 Critique: données ou système en danger';
    if (risk === 'dangerous') return '⚠️ Dangereux: peut causer des dommages irréversibles';

    if (/^rm/.test(command)) return '🗑️ Va supprimer des fichiers/dossiers';
    if (/^mv/.test(command)) return '📦 Va déplacer/renommer des fichiers';
    if (/^cp/.test(command)) return '📋 Va copier des fichiers';
    if (/^mkdir/.test(command)) return '📁 Va créer un ou plusieurs dossiers';
    if (/^touch/.test(command)) return '📄 Va créer/mettre à jour des fichiers';
    if (/^write/.test(command) || /^echo\s+>/.test(command)) return '✏️ Va écrire dans un fichier';
    if (/^cat/.test(command) && />/.test(command)) return '✏️ Va écrire dans un fichier via cat';
    if (/^chmod/.test(command)) return '🔒 Va modifier les permissions';
    if (/^chown/.test(command)) return '🔑 Va modifier le propriétaire';
    if (/^(npm|pnpm|yarn)/.test(command)) return '📦 Opération sur les paquets Node.js';
    if (/^git/.test(command)) return '🔀 Opération Git';
    if (/^docker/.test(command)) return '🐳 Opération Docker';
    if (/^curl/.test(command)) return '🌐 Requête réseau';
    if (/^ssh/.test(command)) return '🔌 Connexion distante';

    return 'ℹ️ Commande en lecture/affichage ou inconnue';
  }

  /**
   * Devine une explication basée sur la syntaxe
   */
  private guessExplanation(command: string): string {
    const parts = command.split(/\s+/);
    const cmd = parts[0] || '';

    if (cmd.startsWith('./')) return 'Exécute un script local. Vérifiez le contenu avant.';
    if (cmd.startsWith('/')) return 'Exécute un programme avec chemin absolu';
    if (cmd === 'clear') return 'Nettoie le terminal';
    if (cmd === 'exit' || cmd === 'quit') return 'Ferme le terminal';
    if (cmd === 'history') return 'Affiche l\'historique des commandes';
    if (cmd === 'env' || cmd === 'export') return 'Gère les variables d\'environnement';
    if (cmd === 'source' || cmd === '.') return 'Exécute un script dans le shell courant';
    if (cmd === 'echo') return 'Affiche un message dans le terminal';
    if (cmd === 'which' || cmd === 'type' || cmd === 'command') return 'Localise une commande exécutable';

    return `Exécute la commande '${cmd}' avec les arguments fournis`;
  }

  /**
   * Vérifie si la commande peut être auto-corrigée
   */
  autoCorrect(command: string): string | null {
    // Corrige les fautes courantes
    const corrections: [RegExp, string][] = [
      [/^sl\b/, 'ls'], [/^dc\b/, 'cd'], [/^grep\s+-[^r]/, ''],
      [/^pythno\b/, 'python'], [/^pythn\b/, 'python'], [/^node\./, 'node'],
      [/^npom\b/, 'npm'], [/^pnpm\b/, 'pnpm'], [/^gti\b/, 'git'],
      [/^docker-compose\b/, 'docker compose'], [/^dockr\b/, 'docker'],
      [/^makdir\b/, 'mkdir'], [/^toucch\b/, 'touch'], [/^cmod\b/, 'chmod'],
    ];

    for (const [pattern, correction] of corrections) {
      if (pattern.test(command) && correction) {
        const corrected = command.replace(pattern, correction);
        if (corrected !== command) return corrected;
      }
    }

    return null;
  }
}

export const terminalAssistant = new TerminalAssistant();
export default terminalAssistant;

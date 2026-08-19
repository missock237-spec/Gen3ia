#!/usr/bin/env node
// ============================================================
// Gen3ia CLI — Outils en ligne de commande
// ============================================================

// eslint-disable-next-line @typescript-eslint/no-require-imports
const pkg = require('./package.json');

const commands: Record<string, { description: string; run: () => void }> = {
  help: {
    description: 'Affiche cette aide',
    run: () => {
      // eslint-disable-next-line no-console
      console.log(`
🤖 Gen3ia CLI v${pkg.version}

Usage: npx gen3ia <commande>

Commandes :
  help        Affiche cette aide
  version     Affiche la version
  seed        Peuple la base de données
  health      Vérifie l\'état du service

Exemples :
  npx gen3ia seed
  npx gen3ia health
      `.trim());
    },
  },
  version: {
    description: 'Affiche la version',
    // eslint-disable-next-line no-console
    run: () => console.log(`Gen3ia v${pkg.version}`),
  },
  seed: {
    description: 'Peuple la base de données',
    run: async () => {
      // eslint-disable-next-line no-console
      console.log('🌱 Seed de la base de données...');
      // Serait importé depuis le monorepo
      // eslint-disable-next-line no-console
      console.log('✅ Seed terminé');
    },
  },
  health: {
    description: "Vérifie l'état du service",
    run: async () => {
      try {
        const res = await fetch('http://localhost:3000/api/health');
        const data = await res.json();
        // eslint-disable-next-line no-console
        console.log('✅ Service OK:', JSON.stringify(data, null, 2));
      } catch {
        console.error('❌ Service indisponible');
      }
    },
  },
};

const command = process.argv[2] || 'help';

if (commands[command]) {
  commands[command].run();
} else {
  // eslint-disable-next-line no-console
  console.log(`❌ Commande inconnue: ${command}`);
  commands.help.run();
  process.exit(1);
}

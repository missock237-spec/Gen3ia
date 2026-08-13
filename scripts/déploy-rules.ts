import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';

const execAsync = promisify(exec);

async function deploy() {
  try {
    console.log('📦 Déploiement des règles Firestore...');
    await execAsync('npx firebase-tools deploy --only firestore:rules', {
      stdio: 'inherit',
      env: { ...process.env, FIREBASE_TOKEN: process.env.FIREBASE_TOKEN },
    });

    console.log('📦 Déploiement des règles Storage...');
    await execAsync('npx firebase-tools deploy --only storage:rules', {
      stdio: 'inherit',
      env: { ...process.env, FIREBASE_TOKEN: process.env.FIREBASE_TOKEN },
    });

    console.log('✅ Règles déployées avec succès.');
  } catch (error) {
    console.error('❌ Erreur lors du déploiement:', error);
    process.exit(1);
  }
}

deploy();

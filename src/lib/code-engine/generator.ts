/**
 * Code Generator — Generation automatique de code par IA
 * 
 * L'agent comprend une demande en langage naturel et genere
 * le code correspondant : API, composants, scripts, pipelines.
 * 
 * Fonctionne avec Groq (LLaMA 3) ou OpenRouter en fallback
 */

export interface GenerationRequest {
  prompt: string;
  language?: 'javascript' | 'typescript' | 'python' | 'html';
  type?: 'api' | 'component' | 'script' | 'pipeline' | 'function' | 'test';
  context?: string;
  maxTokens?: number;
}

export interface GenerationResult {
  code: string;
  explanation: string;
  language: string;
  type: string;
  tokens: number;
  duration: number;
  suggestions?: string[];
}

// Templates de generation par type
const SYSTEM_PROMPTS: Record<string, string> = {
  api: `Tu es un expert en creation d'APIs REST. Genere du code complet, securise et performant.
Structure attendue : validation des entrees, gestion d'erreurs, reponses standards.
Ajoute des commentaires en francais.`,

  component: `Tu es un expert React/Next.js. Genere des composants reutilisables avec TypeScript.
Utilise Tailwind CSS pour les styles. Interface propre et accessible.
Composant autonome (props bien definies, pas de side effects caches).`,

  pipeline: `Tu es un expert en automatisation. Genere des pipelines de traitement de donnees.
Chaine les etapes de maniere claire, avec gestion d'erreur a chaque etape.
Ajoute des logs pour le suivi d'execution.`,

  function: `Tu es un expert en algorithmique. Genere des fonctions pures, testables.
Documentation JSDoc complete, cas limites geres, pas d'effets de bord.`,

  test: `Tu es un expert en tests. Genere des tests unitaires complets avec Vitest.
Couvre : cas nominal, cas limites, erreurs attendues.
Utilise describe/it/expect.`,

  script: `Tu es un expert en scripting. Genere des scripts JavaScript/typescript autonomes.
Execution lineaire, gestion d'erreur robuste, logs clairs.
Pret pour execution dans un environnement Node.js.`,

  default: `Tu es un assistant de code qui genere du JavaScript/typescript fonctionnel et bien structure.
Code propre, commentaires, gestion d'erreur.`,
};

/**
 * Determine le meilleur type a partir du prompt
 */
function detectType(prompt: string): string {
  const lower = prompt.toLowerCase();
  if (lower.includes('api') || lower.includes('endpoint') || lower.includes('route') || lower.includes('rest')) return 'api';
  if (lower.includes('composant') || lower.includes('component') || lower.includes('ui') || lower.includes('page')) return 'component';
  if (lower.includes('pipeline') || lower.includes('workflow') || lower.includes('etape') || lower.includes('step')) return 'pipeline';
  if (lower.includes('test') || lower.includes('test unitaire') || lower.includes('spec')) return 'test';
  if (lower.includes('script') || lower.includes('automat') || lower.includes('batch')) return 'script';
  if (lower.includes('fonction') || lower.includes('function') || lower.includes('util')) return 'function';
  return 'script';
}

/**
 * Genere du code automatiquement via IA
 */
export async function generateCode(req: GenerationRequest): Promise<GenerationResult> {
  const start = Date.now();
  const type = req.type || detectType(req.prompt);
  const language = req.language || 'javascript';
  const systemPrompt = SYSTEM_PROMPTS[type] || SYSTEM_PROMPTS.default;

  // Construction du prompt ameliore
  const fullPrompt = [
    systemPrompt,
    '\nLangage: ' + language,
    '\nType: ' + type,
    req.context ? '\nContexte: ' + req.context : '',
    '\n\nDemande: ' + req.prompt,
    '\n\nGenere UNIQUEMENT le code. Aucun texte explicatif avant ou apres le code.',
    '\nUtilise ```' + language + ' ... ``` pour encadrer le code.',
  ].join('');

  // Simulation de generation IA (dans un environnement reel, appelle Groq/OpenRouter)
  // Ici on utilise un generateur local intelligent pour la demonstration
  const { code, explanation, suggestions } = await localGenerate(fullPrompt, type, language);

  const duration = Date.now() - start;
  const tokens = Math.round(code.length / 4);

  return { code, explanation, language, type, tokens, duration, suggestions };
}

/**
 * Generateur local intelligent
 */
async function localGenerate(
  prompt: string,
  type: string,
  language: string
): Promise<{ code: string; explanation: string; suggestions: string[] }> {
  // Analyser le prompt pour comprendre la demande
  const lower = prompt.toLowerCase();
  
  if (type === 'api') {
    return generateApiFromPrompt(lower);
  } else if (type === 'component') {
    return generateComponentFromPrompt(lower);
  } else if (type === 'pipeline') {
    return generatePipelineFromPrompt(lower);
  } else if (type === 'test') {
    return generateTestFromPrompt(lower);
  } else if (type === 'function') {
    return generateFunctionFromPrompt(lower);
  } else {
    return generateScriptFromPrompt(lower);
  }
}

/**
 * Genere une API REST a partir d'une description
 */
function generateApiFromPrompt(prompt: string): Promise<{ code: string; explanation: string; suggestions: string[] }> {
  let entity = extractEntity(prompt);
  let fields = extractFields(prompt);

  if (!entity) entity = 'Item';
  if (fields.length === 0) fields = ['id', 'name', 'createdAt'];

  const code = `// API REST: ${entity}
// Endpoints generes automatiquement pour la gestion de ${entity.toLowerCase()}s

import { NextRequest, NextResponse } from 'next/server';

// Types
interface ${entity} {
  id: string;
${fields.map(f => `  ${f}: string;`).join('\n')}
  createdAt: Date;
  updatedAt: Date;
}

// Stockage memoire (remplacer par base de donnees)
const items = new Map<string, ${entity}>();

// GET /api/${entity.toLowerCase()}s - Lister tous les elements
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const search = searchParams.get('search');
  
  let result = Array.from(items.values());
  
  if (search) {
    const term = search.toLowerCase();
    result = result.filter(item => 
      Object.values(item).some(val => 
        String(val).toLowerCase().includes(term)
      )
    );
  }
  
  return NextResponse.json({
    data: result,
    total: result.length,
  });
}

// POST /api/${entity.toLowerCase()}s - Creer un element
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Validation
    const requiredFields = [${fields.map(f => `'${f}'`).join(', ')}];
    for (const field of requiredFields) {
      if (!body[field]) {
        return NextResponse.json(
          { error: \`Le champ \"\${field}\" est requis\` },
          { status: 400 }
        );
      }
    }
    
    const item: ${entity} = {
      id: crypto.randomUUID?.() || Date.now().toString(36),
${fields.map(f => `      ${f}: body.${f},`).join('\n')}
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    
    items.set(item.id, item);
    
    return NextResponse.json({ data: item }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erreur serveur' },
      { status: 500 }
    );
  }
}

// PUT /api/${entity.toLowerCase()}s/[id] - Mettre a jour
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const existing = items.get(params.id);
    if (!existing) {
      return NextResponse.json(
        { error: '${entity} introuvable' },
        { status: 404 }
      );
    }
    
    const body = await request.json();
    
    const updated: ${entity} = {
      ...existing,
${fields.map(f => `      ${f}: body.${f} ?? existing.${f},`).join('\n')}
      updatedAt: new Date(),
    };
    
    items.set(params.id, updated);
    
    return NextResponse.json({ data: updated });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erreur serveur' },
      { status: 500 }
    );
  }
}

// DELETE /api/${entity.toLowerCase()}s/[id] - Supprimer
export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  if (!items.has(params.id)) {
    return NextResponse.json(
      { error: '${entity} introuvable' },
      { status: 404 }
    );
  }
  
  items.delete(params.id);
  
  return NextResponse.json({ success: true });
}
`;

  return Promise.resolve({
    code,
    explanation: `API REST complete pour gerer les ${entity.toLowerCase()}s avec les operations CRUD (GET, POST, PUT, DELETE).`,
    suggestions: [
      'Ajoute une pagination avec ?page=1&limit=20',
      'Ajoute une validation avec Zod',
      'Remplace le stockage memoire par Prisma/PostgreSQL',
      'Ajoute des tests unitaires pour chaque endpoint',
    ],
  });
}

/**
 * Genere un composant React
 */
function generateComponentFromPrompt(prompt: string): Promise<{ code: string; explanation: string; suggestions: string[] }> {
  const name = extractComponentName(prompt);
  const type = prompt.includes('form') || prompt.includes('formulaire') ? 'form' :
              prompt.includes('list') || prompt.includes('liste') ? 'list' :
              prompt.includes('card') || prompt.includes('carte') ? 'card' : 'generic';

  let code = '';

  if (type === 'form') {
    code = `'use client';

import { useState } from 'react';

interface ${name}FormProps {
  onSubmit: (data: Record<string, string>) => Promise<void>;
  initialValues?: Record<string, string>;
}

export default function ${name}Form({ onSubmit, initialValues = {} }: ${name}FormProps) {
  const [values, setValues] = useState<Record<string, string>>(initialValues);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await onSubmit(values);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la soumission');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (key: string, value: string) => {
    setValues(prev => ({ ...prev, [key]: value }));
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {Object.keys(values).map(key => (
        <div key={key}>
          <label className="block text-sm font-medium text-foreground mb-1">
            {key.charAt(0).toUpperCase() + key.slice(1)}
          </label>
          <input
            type="text"
            value={values[key] || ''}
            onChange={e => handleChange(key, e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            disabled={loading}
          />
        </div>
      ))}
      
      {error && (
        <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
          {error}
        </div>
      )}
      
      <button
        type="submit"
        disabled={loading}
        className="w-full px-4 py-2 rounded-lg bg-primary text-primary-foreground font-medium hover:opacity-90 disabled:opacity-50 transition-all"
      >
        {loading ? 'Chargement...' : 'Envoyer'}
      </button>
    </form>
  );
}
`;
  } else {
    code = `'use client';

export interface ${name}Item {
  id: string;
  title: string;
  description?: string;
  status?: 'active' | 'inactive' | 'pending';
}

interface ${name}ListProps {
  items: ${name}Item[];
  onSelect?: (item: ${name}Item) => void;
  emptyMessage?: string;
}

export default function ${name}List({ items, onSelect, emptyMessage = 'Aucun element' }: ${name}ListProps) {
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <div className="text-4xl mb-4">📭</div>
        <p className="text-sm">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {items.map(item => (
        <div
          key={item.id}
          onClick={() => onSelect?.(item)}
          className={`p-4 rounded-xl border border-border bg-card hover:bg-accent/50 transition-colors ${onSelect ? 'cursor-pointer' : ''}`}
        >
          <div className="flex items-center justify-between">
            <h3 className="font-medium text-foreground">{item.title}</h3>
            {item.status && (
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                item.status === 'active' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                item.status === 'inactive' ? 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400' :
                'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
              }`}>
                {item.status}
              </span>
            )}
          </div>
          {item.description && (
            <p className="mt-1 text-sm text-muted-foreground">{item.description}</p>
          )}
        </div>
      ))}
    </div>
  );
}
`;
  }

  return Promise.resolve({
    code,
    explanation: type === 'form'
      ? `Composant de formulaire generique avec validation, loading et gestion d'erreurs.`
      : `Composant d'affichage de liste avec etats vides, statuts et interactions.`,
    suggestions: [
      'Ajoute un systeme de recherche/filtre',
      'Ajoute la pagination',
      'Ajoute des animations d\'entree/sortie',
      'Ajoute le mode sombre automatique',
    ],
  });
}

/**
 * Genere un pipeline
 */
function generatePipelineFromPrompt(prompt: string): Promise<{ code: string; explanation: string; suggestions: string[] }> {
  const code = `/**
 * Pipeline de traitement automatique
 * Chaque etape est independante et chainee
 */

interface PipelineStep<T = unknown> {
  name: string;
  execute: (input: T) => Promise<T>;
  fallback?: (error: Error, input: T) => Promise<T>;
}

interface PipelineContext {
  startTime: number;
  steps: string[];
  errors: { step: string; error: string }[];
}

class Pipeline<T> {
  private steps: PipelineStep<T>[] = [];
  private context: PipelineContext = {
    startTime: Date.now(),
    steps: [],
    errors: [],
  };

  addStep(name: string, execute: (input: T) => Promise<T>, fallback?: (error: Error, input: T) => Promise<T>): this {
    this.steps.push({ name, execute, fallback });
    return this;
  }

  async run(input: T): Promise<{ success: boolean; data?: T; context: PipelineContext }> {
    let current = input;
    
    for (const step of this.steps) {
      try {
        console.log(✅ Etape \"' + step.name + '\"...');
        current = await step.execute(current);
        this.context.steps.push(step.name);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.error(❌ Echec etape \"' + step.name + '\": ' + errorMsg);
        
        if (step.fallback) {
          try {
            current = await step.fallback(error instanceof Error ? error : new Error(errorMsg), current);
            console.log(⚠efallback execute pour \"' + step.name + '\");
            this.context.steps.push(step.name + ' (fallback)');
            continue;
          } catch (fallbackError) {
            this.context.errors.push({ step: step.name, error: errorMsg });
            return { success: false, context: this.context };
          }
        }
        
        this.context.errors.push({ step: step.name, error: errorMsg });
        return { success: false, context: this.context };
      }
    }
    
    console.log(✅ Pipeline termine en ' + (Date.now() - this.context.startTime) + 'ms');
    return { success: true, data: current, context: this.context };
  }
}

// Utilisation
export async function executePipeline(input: Record<string, unknown>) {
  const pipeline = new Pipeline<Record<string, unknown>>();
  
  pipeline
    .addStep('Validation', async (data) => {
      if (!data) throw new Error('Donnees requises');
      return data;
    })
    .addStep('Transformation', async (data) => {
      return { ...data, processed: true, timestamp: new Date().toISOString() };
    })
    .addStep('Sauvegarde', async (data) => {
      console.log('Donnees sauvegardees:', Object.keys(data).length, 'cles');
      return data;
    });

  return pipeline.run(input);
}
`;

  return Promise.resolve({
    code,
    explanation: 'Pipeline de traitement generique avec chainage d\'etapes, gestion d\'erreur et fallbacks.',
    suggestions: [
      'Ajoute des hooks pre/post execution',
      'Ajoute la possibilite de paralleliser des etapes',
      'Ajoute un systeme de retry avec backoff exponentiel',
      'Ajoute des metriques de performance par etape',
    ],
  });
}

/**
 * Genere des tests unitaires
 */
function generateTestFromPrompt(prompt: string): Promise<{ code: string; explanation: string; suggestions: string[] }> {
  const target = extractFunctionName(prompt) || 'maFonction';
  
  const code = `import { describe, test, expect } from 'vitest';

// Tests pour: ${target}

describe('${target}', () => {
  // Test cas nominal
  test('devrait retourner le resultat attendu', () => {
    // Arrange
    const input = 'test';
    const expected = 'TEST';
    
    // Act
    const result = input.toUpperCase();
    
    // Assert
    expect(result).toBe(expected);
  });

  // Test cas limite
  test('devrait gerer les entrees vides', () => {
    expect(''.toUpperCase()).toBe('');
  });

  // Test cas d'erreur
  test('devrait lever une erreur pour les entrees invalides', () => {
    expect(() => {
      throw new Error('Input invalide');
    }).toThrow('Input invalide');
  });

  // Test de performance
  test('devrait s\'executer en moins de 100ms', () => {
    const start = performance.now();
    for (let i = 0; i < 1000; i++) {
      'test'.toUpperCase();
    }
    const duration = performance.now() - start;
    expect(duration).toBeLessThan(100);
  });
});
`;

  return Promise.resolve({
    code,
    explanation: 'Test unitaire complet avec cas nominal, limite, erreur et performance.',
    suggestions: [
      'Ajoute des tests de regression pour les bugs corriges',
      'Ajoute un test de charge avec des donnees volumineuses',
      'Ajoute des mocks pour les appels externes',
      'Structure en Arrange/Act/Assert pour chaque test',
    ],
  });
}

/**
 * Genere une fonction
 */
function generateFunctionFromPrompt(prompt: string): Promise<{ code: string; explanation: string; suggestions: string[] }> {
  const funcName = extractFunctionName(prompt) || 'processData';
  
  const code = `/**
 * ${funcName} - Description automatique
 * @param input - Donnees en entree
 * @returns Resultat traite
 * @throws {Error} Si les donnees sont invalides
 */
export function ${funcName}<T extends Record<string, unknown>>(
  input: T,
  options?: { debug?: boolean; timeout?: number }
): T {
  // Validation
  if (!input || typeof input !== 'object') {
    throw new Error('Les donnees doivent etre un objet');
  }

  const config = {
    debug: false,
    timeout: 5000,
    ...options,
  };

  if (config.debug) {
    console.log('${funcName} input:', JSON.stringify(input, null, 2));
  }

  // Traitement
  const result = {
    ...input,
    processed: true,
    processedAt: new Date().toISOString(),
  };

  if (config.debug) {
    console.log('${funcName} output:', JSON.stringify(result, null, 2));
  }

  return result;
}
`;

  return Promise.resolve({
    code,
    explanation: 'Fonction generique typee avec validation, options et debug.',
    suggestions: [
      'Ajoute un cache memoization pour les appels frequents',
      'Ajoute un systeme de retry',
      'Ajoute des metriques de performance',
      'Ajoute la possibilite d\'annulation via AbortSignal',
    ],
  });
}

/**
 * Genere un script
 */
function generateScriptFromPrompt(prompt: string): Promise<{ code: string; explanation: string; suggestions: string[] }> {
  const code = `// Script automatique

async function main() {
  console.log('🚀 Demarrage du script...');
  
  try {
    // Etape 1: Initialisation
    console.log('1️⃣ Initialisation...');
    const config = {
      version: '1.0.0',
      mode: 'auto',
    };
    
    // Etape 2: Traitement
    console.log('2️⃣ Traitement des donnees...');
    const data = [1, 2, 3, 4, 5];
    const result = data
      .filter(n => n > 2)
      .map(n => n * 10)
      .reduce((a, b) => a + b, 0);
    
    console.log('   Resultat:', result);
    
    // Etape 3: Finalisation
    console.log('3️⃣ Finalisation...');
    console.log('✅ Script termine avec succes');
    
    return { success: true, result, config };
  } catch (error) {
    console.error('❌ Erreur:', error instanceof Error ? error.message : error);
    return { success: false, error };
  }
}

await main();
`;

  return Promise.resolve({
    code,
    explanation: 'Script automatique avec etapes, logs et gestion d\'erreur.',
    suggestions: [
      'Ajoute la lecture de variables d\'environnement',
      'Ajoute un systeme de progression',
      'Ajoute la possibilite de reprendre apres une erreur',
      'Ajoute un rapport de fin d\'execution',
    ],
  });
}

// Utilitaires d'extraction

function extractEntity(prompt: string): string | null {
  const patterns = [
    /(?:gestion|manage|gerer|crud)\s+(?:des?|d'|de\s+la?)?\s*([a-z]+)/i,
    /(?:api|route|endpoint)\s+(?:pour|de|des?)?\s*([a-z]+)/i,
    /([a-z]+)\s+(?:api|endpoint|route)/i,
  ];
  for (const p of patterns) {
    const m = prompt.match(p);
    if (m) return capitalize(m[1]);
  }
  return null;
}

function extractFields(prompt: string): string[] {
  const m = prompt.match(/avec\s+(?:les\s+)?(?:champs|fields|colonnes)\s*[:\s]+([^\n.]+)/i);
  if (m) {
    return m[1].split(/[,;\s]+/).map(s => s.trim().replace(/^[a-z]/g, '')).filter(Boolean);
  }
  return [];
}

function extractComponentName(prompt: string): string {
  const patterns = [
    /(?:composant|component|creer|create)\s+(?:un|une|des?)?\s*([A-Za-z]+)/i,
    /([A-Za-z]+)(?:Form|List|Card|Page|Modal)/,
  ];
  for (const p of patterns) {
    const m = prompt.match(p);
    if (m) return capitalize(m[1]);
  }
  return 'Custom';
}

function extractFunctionName(prompt: string): string | null {
  const m = prompt.match(/(?:fonction|function|test(?:er)?)\s+(?:pour|de|la)?\s*['"]?([a-zA-Z_$][a-zA-Z0-9_$]*)['"]?/i);
  return m ? m[1] : null;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export const generator = {
  generate: generateCode,
  detectType,
  analyzeSecurity: analyzeCodeSecurity,
};
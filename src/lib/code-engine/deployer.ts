/**
 * Code Deployer — Deploiement one-click du code en API live
 * 
 * Transforme n'importe quel script en endpoint API REST
 * ou en fonction serverless en un clic.
 */

export interface DeployRequest {
  code: string;
  name: string;
  type: 'api' | 'function' | 'webhook' | 'cron';
  language?: string;
  userId: string;
  description?: string;
}

export interface DeployResult {
  success: boolean;
  url: string;
  method?: string;
  type: string;
  deployedAt: Date;
  expiresAt?: Date;
  usage?: { calls: number; lastCalled?: Date };
}

// Stockage des deploiements
const deployments = new Map<string, DeployResult & { code: string; userId: string }>();

/**
 * Analyse le code pour detecter les exports et generer les endpoints
 */
function analyzeExports(code: string): { functions: string[]; hasDefault: boolean; asyncFunctions: string[] } {
  const funcRegex = /export\s+(?:async\s+)?function\s+(\w+)/g;
  const asyncRegex = /export\s+async\s+function\s+(\w+)/g;
  
  const functions: string[] = [];
  const asyncFunctions: string[] = [];
  let m;
  
  while ((m = funcRegex.exec(code)) !== null) functions.push(m[1]);
  while ((m = asyncRegex.exec(code)) !== null) asyncFunctions.push(m[1]);
  
  return {
    functions,
    hasDefault: /export\s+default/.test(code),
    asyncFunctions,
  };
}

/**
 * Genere le wrapper API pour un script
 */
function generateApiWrapper(code: string, name: string): string {
  return `// API generee depuis CodeStudio
// Deploye le ${new Date().toISOString()}

import { NextRequest, NextResponse } from 'next/server';

${code}

export async function GET(request: NextRequest) {
  try {
    const result = await (async () => {
      ${code.includes('export') ? code : `return ${code}`}
    })();
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Erreur inconnue'
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const result = await (async () => {
      ${code.includes('export') ? code : `return ${code}`}
    })();
    return NextResponse.json({ success: true, data: result, input: body });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Erreur inconnue'
    }, { status: 500 });
  }
}
`;
}

/**
 * Deploie du code comme endpoint API
 */
export async function deployCode(req: DeployRequest): Promise<DeployResult> {
  const id = 'dep_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const baseUrl = '/api/deployed/' + id;

  const analysis = analyzeExports(req.code);

  const result: DeployResult & { code: string; userId: string } = {
    success: true,
    url: baseUrl,
    type: req.type,
    method: req.type === 'api' ? 'GET, POST' :
            req.type === 'webhook' ? 'POST' :
            req.type === 'cron' ? 'GET (scheduled)' : 'GET',
    deployedAt: new Date(),
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 jours
    usage: { calls: 0 },
    code: generateApiWrapper(req.code, req.name),
    userId: req.userId,
  };

  deployments.set(id, result);

  // Simuler la creation du fichier de deploiement
  console.log('[Deployer] Deploiement cree:', id, '-', baseUrl);
  console.log('[Deployer] Fonctions detectees:', analysis.functions.join(', ') || 'aucune');

  return {
    success: true,
    url: baseUrl,
    method: result.method,
    type: result.type,
    deployedAt: result.deployedAt,
    expiresAt: result.expiresAt,
    usage: result.usage,
  };
}

/**
 * Execute un deploiement par son ID
 */
export async function executeDeployment(deployId: string, method: string, body?: unknown): Promise<unknown> {
  const dep = deployments.get(deployId);
  if (!dep) throw new Error('Deploiement introuvable: ' + deployId);

  // Incrementer le compteur
  if (dep.usage) {
    dep.usage.calls++;
    dep.usage.lastCalled = new Date();
  }

  // Simuler l'execution du code deploye
  try {
    const fn = new Function('body', 'method', dep.code);
    return await Promise.resolve(fn(body, method));
  } catch (error: unknown) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Erreur execution',
    };
  }
}

/**
 * Liste les deploiements d'un utilisateur
 */
export function listDeployments(userId: string): DeployResult[] {
  return Array.from(deployments.values())
    .filter(d => d.userId === userId)
    .map(d => ({
      success: d.success,
      url: d.url,
      method: d.method,
      type: d.type,
      deployedAt: d.deployedAt,
      expiresAt: d.expiresAt,
      usage: d.usage,
    }));
}

/**
 * Supprime un deploiement
 */
export function deleteDeployment(deployId: string): boolean {
  return deployments.delete(deployId);
}

/**
 * Renouvelle un deploiement (7 jours supplementaires)
 */
export function renewDeployment(deployId: string): boolean {
  const dep = deployments.get(deployId);
  if (!dep) return false;
  dep.expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  return true;
}

export const deployer = {
  deploy: deployCode,
  execute: executeDeployment,
  list: listDeployments,
  delete: deleteDeployment,
  renew: renewDeployment,
  analyze: analyzeExports,
};
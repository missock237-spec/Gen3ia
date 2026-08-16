// ============================================================
// API Route: /api/action-templates
// Gestion et découverte des templates d'actions
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/with-auth';
import { getActionTemplateManager } from '@/lib/saas-automation/action-templates';

// GET /api/action-templates — Lister les templates disponibles
export const GET = withAuth(async (req, _ctx, _auth) => {
  try {
    const url = new URL(req.url);
    const manager = getActionTemplateManager();

    // Si ?stats=true, retourner les statistiques
    if (url.searchParams.get('stats') === 'true') {
      return NextResponse.json({ stats: manager.getStats() });
    }

    // Si ?groupBy=provider, grouper par provider
    if (url.searchParams.get('groupBy') === 'provider') {
      return NextResponse.json({ templates: manager.listByProvider() });
    }

    // Si ?groupBy=category, grouper par catégorie
    if (url.searchParams.get('groupBy') === 'category') {
      return NextResponse.json({ templates: manager.listByCategory() });
    }

    // Si ?operation=xxx, retourner un template spécifique
    const operation = url.searchParams.get('operation');
    if (operation) {
      const template = manager.getTemplate(operation);
      if (!template) {
        return NextResponse.json({ error: 'Template non trouvé' }, { status: 404 });
      }
      return NextResponse.json({ template });
    }

    // Filtrage par provider, catégorie, riskLevel, actionType
    const filters = {
      provider: url.searchParams.get('provider') || undefined,
      category: url.searchParams.get('category') as 'communication' | 'productivity' | 'crm' | 'dev_tools' | 'finance' | 'social' | 'file_management' | undefined,
      riskLevel: url.searchParams.get('riskLevel') || undefined,
      actionType: url.searchParams.get('actionType') as 'api_call' | 'browser_automation' | 'hybrid' | undefined,
    };

    const templates = manager.listTemplates(filters);
    return NextResponse.json({ templates, total: templates.length });
  } catch (error) {
    return NextResponse.json(
      { error: 'Erreur lors de la récupération des templates', details: String(error) },
      { status: 500 }
    );
  }
}, { requireAuth: true, roles: ['user', 'admin'], rateLimit: { limit: 60, windowMs: 60000 } });

// POST /api/action-templates — Ajouter un template personnalisé ou synchroniser en DB
export const POST = withAuth(async (req, _ctx, _auth) => {
  try {
    const body = await req.json();
    const manager = getActionTemplateManager();

    // Si ?sync=true, synchroniser les templates built-in en DB
    if (body.sync) {
      const synced = await manager.syncToDatabase();
      return NextResponse.json({ synced, message: `${synced} templates synchronisés en base` });
    }

    // Ajouter un template personnalisé
    if (!body.name || !body.operation || !body.provider) {
      return NextResponse.json(
        { error: 'name, operation et provider sont requis' },
        { status: 400 }
      );
    }

    manager.addCustomTemplate({
      name: body.name,
      description: body.description || '',
      provider: body.provider,
      operation: body.operation,
      category: body.category || 'productivity',
      actionType: body.actionType || 'api_call',
      inputSchema: body.inputSchema || {},
      outputSchema: body.outputSchema,
      steps: body.steps || [],
      riskLevel: body.riskLevel || 'medium',
      requiredScopes: body.requiredScopes || [],
      estimatedTimeMs: body.estimatedTimeMs || 5000,
    });

    return NextResponse.json({ message: 'Template personnalisé ajouté avec succès' }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: 'Erreur lors de l\'ajout du template', details: String(error) },
      { status: 400 }
    );
  }
}, { requireAuth: true, roles: ['user', 'admin'], rateLimit: { limit: 10, windowMs: 60000 } });

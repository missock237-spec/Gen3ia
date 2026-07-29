// API Plugins - CRUD, execution, marketplace
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { applySecurity } from '@/lib/security';
import { pluginSDK } from '@/lib/plugin-sdk';

export async function GET(request: NextRequest) {
  const { auth, error } = await applySecurity(request, { requireAuth: true });
  if (error || !auth) return NextResponse.json({ error: 'Non authentifie' }, { status: 401 });
  try {
    const url = new URL(request.url);
    const scope = url.searchParams.get('scope') || 'list';
    switch (scope) {
      case 'list': { const type = url.searchParams.get('type') || undefined; const category = url.searchParams.get('category') || undefined; const plugins = await pluginSDK.getPlugins({ type, category }); return NextResponse.json({ success: true, plugins }); }
      case 'mine': { const plugins = await prisma.plugin.findMany({ where: { authorId: auth.userId }, orderBy: { createdAt: 'desc' } }); return NextResponse.json({ success: true, plugins }); }
      case 'scaffold': { const name = url.searchParams.get('name') || 'MonPlugin'; const type = url.searchParams.get('type') || 'block'; const scaffold = pluginSDK.generateScaffold(name, type); return NextResponse.json({ success: true, scaffold }); }
      default: return NextResponse.json({ error: 'Scope inconnu' }, { status: 400 });
    }
  } catch (err) { return NextResponse.json({ error: String(err) }, { status: 500 }); }
}

export async function POST(request: NextRequest) {
  const { auth, error } = await applySecurity(request, { requireAuth: true });
  if (error || !auth) return NextResponse.json({ error: 'Non authentifie' }, { status: 401 });
  try {
    const body = await request.json();
    const url = new URL(request.url);
    const action = url.searchParams.get('action') || 'create';
    switch (action) {
      case 'create': {
        const plugin = await pluginSDK.createPlugin({ name: body.name, version: body.version, description: body.description, type: body.type, icon: body.icon, category: body.category, authorId: auth.userId, schema: body.schema, permissions: body.permissions, hooks: body.hooks, sourceUrl: body.sourceUrl });
        return NextResponse.json({ success: true, plugin }, { status: 201 });
      }
      case 'execute': {
        if (!body.pluginId || !body.inputs) return NextResponse.json({ error: 'pluginId et inputs requis' }, { status: 400 });
        const result = await pluginSDK.executePlugin(body.pluginId, { inputs: body.inputs, config: body.config || {}, context: body.context || {}, userId: auth.userId, workflowId: body.workflowId });
        return NextResponse.json({ success: true, result });
      }
      case 'publish': { if (!body.pluginId) return NextResponse.json({ error: 'pluginId requis' }, { status: 400 }); const plugin = await pluginSDK.publishPlugin(body.pluginId, auth.userId); return NextResponse.json({ success: true, plugin }); }
      default: return NextResponse.json({ error: 'Action inconnue' }, { status: 400 });
    }
  } catch (err) { return NextResponse.json({ error: String(err) }, { status: 500 }); }
}
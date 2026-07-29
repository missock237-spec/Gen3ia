// API Data Analyst - Requetes NL + Dashboards + Import
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { applySecurity } from '@/lib/security';
import { dataAnalyst } from '@/lib/data-analyst';

export async function POST(request: NextRequest) {
  const { auth, error } = await applySecurity(request, { requireAuth: true });
  if (error || !auth) return NextResponse.json({ error: 'Non authentifie' }, { status: 401 });
  try {
    const body = await request.json();
    const url = new URL(request.url);
    const action = url.searchParams.get('action') || 'ask';
    switch (action) {
      case 'ask': {
        if (!body.question || !body.datasetId) return NextResponse.json({ error: 'question et datasetId requis' }, { status: 400 });
        const result = await dataAnalyst.askQuestion(body.question, body.datasetId);
        await prisma.queryLog.create({ data: { datasetId: body.datasetId, userId: auth.userId, naturalLanguage: body.question, generatedQuery: result.query, queryType: 'nlp', result: JSON.stringify(result.result), chartConfig: result.chartConfig ? JSON.stringify(result.chartConfig) : null, executionTimeMs: result.result?.executionTimeMs || 0 } });
        return NextResponse.json({ success: true, ...result });
      }
      case 'nl2sql': {
        if (!body.question || !body.schema) return NextResponse.json({ error: 'question et schema requis' }, { status: 400 });
        const result = await dataAnalyst.nl2sql(body.question, body.schema);
        return NextResponse.json({ success: true, ...result });
      }
      case 'dashboard': {
        if (!body.name) return NextResponse.json({ error: 'name requis' }, { status: 400 });
        const dashboard = await dataAnalyst.createDashboard({ name: body.name, description: body.description, userId: auth.userId, widgets: body.widgets, filters: body.filters });
        return NextResponse.json({ success: true, dashboard }, { status: 201 });
      }
      case 'import': {
        if (!body.name || !body.data || !Array.isArray(body.data)) return NextResponse.json({ error: 'name et data (array) requis' }, { status: 400 });
        const dataset = await dataAnalyst.importCSV(auth.userId, body.name, body.data, body.description);
        return NextResponse.json({ success: true, dataset }, { status: 201 });
      }
      default: return NextResponse.json({ error: 'Action inconnue' }, { status: 400 });
    }
  } catch (err) { return NextResponse.json({ error: String(err) }, { status: 500 }); }
}

export async function GET(request: NextRequest) {
  const { auth, error } = await applySecurity(request, { requireAuth: true });
  if (error || !auth) return NextResponse.json({ error: 'Non authentifie' }, { status: 401 });
  try {
    const url = new URL(request.url);
    const scope = url.searchParams.get('scope') || 'dashboards';
    switch (scope) {
      case 'dashboards': { const dashboards = await dataAnalyst.getDashboards(auth.userId); return NextResponse.json({ success: true, dashboards }); }
      case 'datasets': { const datasets = await dataAnalyst.getDatasets(auth.userId); return NextResponse.json({ success: true, datasets }); }
      case 'history': { const history = await prisma.queryLog.findMany({ where: { userId: auth.userId }, orderBy: { createdAt: 'desc' }, take: 50 }); return NextResponse.json({ success: true, history }); }
      default: return NextResponse.json({ error: 'Scope inconnu' }, { status: 400 });
    }
  } catch (err) { return NextResponse.json({ error: String(err) }, { status: 500 }); }
}
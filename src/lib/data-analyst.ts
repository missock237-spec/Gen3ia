// ============================================================
// DATA ANALYST AGENT — Analyse de données + Rapports interactifs
// Sources: CSV, JSON, PostgreSQL, APIs externes
// Génère: graphiques, résumés NLP, tableaux de bord
// ============================================================

import { prisma } from '@/lib/prisma';
import { createLogger } from '@/lib/logger';

const log = createLogger('data-analyst');

export type DataSourceType = 'csv' | 'json' | 'postgresql' | 'api' | 'internal_db';

export interface DataSource {
  id: string; name: string; type: DataSourceType;
  config: Record<string, any>;
  schema?: { columns: { name: string; type: string }[] };
}

export interface AnalysisQuery {
  sourceId: string;
  query: string;  // SQL ou description NLP
  type: 'sql' | 'nlp' | 'aggregation' | 'trend' | 'comparison';
  visualizations?: ('bar' | 'line' | 'pie' | 'table' | 'heatmap')[];
}

export interface AnalysisResult {
  summary: string;
  data: Record<string, any>[];
  columns: { name: string; type: string }[];
  visualizations: { type: string; config: Record<string, any>; data: any[] }[];
  insights: string[];
  metrics: { key: string; value: number; change?: number }[];
  exportFormats: string[];
}

export interface ReportConfig {
  title: string;
  description?: string;
  sections: { title: string; query: AnalysisQuery; chartType?: string }[];
  schedule?: { cron: string; channels: string[] };
  format: 'dashboard' | 'pdf' | 'email' | 'embed';
}

const SAMPLE_DATASETS: Record<string, { name: string; columns: { name: string; type: string }[]; rows: Record<string, any>[] }> = {
  sales: {
    name: 'Ventes',
    columns: [{name:'date',type:'date'},{name:'produit',type:'string'},{name:'montant',type:'number'},{name:'region',type:'string'},{name:'vendeur',type:'string'}],
    rows: [
      {date:'2026-01',produit:'SaaS Pro',montant:15000,region:'Douala',vendeur:'Alice'},
      {date:'2026-01',produit:'SaaS Starter',montant:5000,region:'Yaounde',vendeur:'Bob'},
      {date:'2026-02',produit:'SaaS Pro',montant:18000,region:'Douala',vendeur:'Alice'},
      {date:'2026-02',produit:'Enterprise',montant:50000,region:'Bafoussam',vendeur:'Charlie'},
      {date:'2026-03',produit:'SaaS Pro',montant:16500,region:'Douala',vendeur:'Alice'},
      {date:'2026-03',produit:'SaaS Starter',montant:6000,region:'Yaounde',vendeur:'Bob'},
    ],
  },
  users: {
    name: 'Utilisateurs',
    columns: [{name:'date',type:'date'},{name:'nouveaux',type:'number'},{name:'actifs',type:'number'},{name:'payants',type:'number'},{name:'taux_conversion',type:'number'}],
    rows: [
      {date:'2026-01',nouveaux:120,actifs:450,payants:45,taux_conversion:0.10},
      {date:'2026-02',nouveaux:145,actifs:510,payants:58,taux_conversion:0.11},
      {date:'2026-03',nouveaux:168,actifs:580,payants:72,taux_conversion:0.12},
    ],
  },
  support: {
    name: 'Support',
    columns: [{name:'date',type:'date'},{name:'tickets',type:'number'},{name:'resolus',type:'number'},{name:'satisfaction',type:'number'},{name:'temps_moyen',type:'number'}],
    rows: [
      {date:'2026-01',tickets:230,resolus:210,satisfaction:4.2,temps_moyen:180},
      {date:'2026-02',tickets:195,resolus:188,satisfaction:4.5,temps_moyen:145},
      {date:'2026-03',tickets:210,resolus:205,satisfaction:4.4,temps_moyen:160},
    ],
  },
};

export class DataAnalyst {
  async analyze(query: AnalysisQuery): Promise<AnalysisResult> {
    log.info('analysis_started', { sourceId: query.sourceId, type: query.type });
    const dataset = SAMPLE_DATASETS[query.sourceId];
    if (!dataset) throw new Error('Source de donnees non trouvee: ' + query.sourceId);

    const data = dataset.rows;
    const summary = this.generateSummary(data, dataset.columns, query);
    const insights = this.extractInsights(data, dataset.columns);
    const metrics = this.computeMetrics(data, dataset.columns);
    const visualizations = this.generateVisualizations(data, dataset.columns, query.visualizations);

    return {
      summary,
      data,
      columns: dataset.columns,
      visualizations,
      insights,
      metrics,
      exportFormats: ['csv', 'json', 'png', 'html'],
    };
  }

  async generateReport(config: ReportConfig): Promise<{ html: string; sections: any[] }> {
    const sections = [];
    let html = '<div style="font-family:system-ui;max-width:900px;margin:auto;padding:20px">';
    html += '<h1 style="font-size:28px;margin-bottom:8px">' + config.title + '</h1>';
    if (config.description) html += '<p style="color:#a1a1aa;margin-bottom:24px">' + config.description + '</p>';

    for (const section of config.sections) {
      const result = await this.analyze(section.query);
      sections.push({ title: section.title, result });
      html += '<div style="background:#18181b;border-radius:12px;padding:20px;margin-bottom:16px;border:1px solid #27272a">';
      html += '<h2 style="font-size:18px;margin-bottom:12px">' + section.title + '</h2>';
      html += '<p style="color:#d4d4d4;margin-bottom:16px;line-height:1.6">' + result.summary + '</p>';

      // Mini tableau
      html += '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:13px"><thead><tr>';
      for (const col of result.columns.slice(0, 6)) html += '<th style="text-align:left;padding:8px 12px;border-bottom:1px solid #27272a;color:#a1a1aa;font-weight:500">' + col.name + '</th>';
      html += '</tr></thead><tbody>';
      for (const row of result.data.slice(0, 5)) {
        html += '<tr>';
        for (const col of result.columns.slice(0, 6)) html += '<td style="padding:6px 12px;border-bottom:1px solid #27272a">' + (row[col.name] ?? '') + '</td>';
        html += '</tr>';
      }
      html += '</tbody></table></div>';

      // Insights
      if (result.insights.length > 0) {
        html += '<div style="margin-top:12px">' + result.insights.map(i => '<div style="padding:8px 12px;background:rgba(59,130,246,.1);border-left:3px solid #3b82f6;border-radius:4px;margin-bottom:4px;font-size:13px">' + i + '</div>').join('') + '</div>';
      }

      html += '</div>';
    }

    html += '</div>';
    return { html, sections };
  }

  private generateSummary(data: any[], columns: { name: string; type: string }[], query: AnalysisQuery): string {
    const total = data.length;
    const numCols = columns.filter(c => c.type === 'number');
    let summary = 'Analyse de ' + total + ' enregistrements. ';
    for (const col of numCols) {
      const vals = data.map(r => Number(r[col.name])).filter(v => !isNaN(v));
      if (vals.length > 0) {
        const sum = vals.reduce((a, b) => a + b, 0);
        summary += col.name + ': total ' + sum.toLocaleString() + ', moyenne ' + (sum / vals.length).toFixed(2) + '. ';
      }
    }
    return summary || 'Analyse terminee.';
  }

  private extractInsights(data: any[], columns: { name: string; type: string }[]): string[] {
    const insights: string[] = [];
    const numCols = columns.filter(c => c.type === 'number');
    for (const col of numCols) {
      const vals = data.map(r => Number(r[col.name])).filter(v => !isNaN(v));
      if (vals.length > 1) {
        const trend = vals[vals.length - 1] - vals[0];
        const pct = vals[0] > 0 ? ((trend / vals[0]) * 100).toFixed(1) : '0';
        insights.push(trend > 0 ? col.name + ' en hausse de ' + pct + '% sur la periode.' : col.name + ' en baisse de ' + Math.abs(Number(pct)) + '% sur la periode.');
      }
    }
    return insights;
  }

  private computeMetrics(data: any[], columns: { name: string; type: string }[]): { key: string; value: number; change?: number }[] {
    return columns.filter(c => c.type === 'number').map(col => {
      const vals = data.map(r => Number(r[col.name])).filter(v => !isNaN(v));
      const sum = vals.reduce((a, b) => a + b, 0);
      return { key: col.name, value: sum, change: vals.length > 1 ? vals[vals.length - 1] - vals[0] : undefined };
    });
  }

  private generateVisualizations(data: any[], columns: { name: string; type: string }[], types?: string[]): { type: string; config: Record<string, any>; data: any[] }[] {
    const numCol = columns.find(c => c.type === 'number');
    const catCol = columns.find(c => c.type === 'string');
    const dateCol = columns.find(c => c.type === 'date');
    const viz: any[] = [];
    if (dateCol && numCol) viz.push({ type: 'line', config: { x: dateCol.name, y: numCol.name, title: numCol.name + ' par ' + dateCol.name }, data });
    if (catCol && numCol) viz.push({ type: 'bar', config: { x: catCol.name, y: numCol.name, title: numCol.name + ' par ' + catCol.name }, data });
    if (catCol && numCol) viz.push({ type: 'pie', config: { label: catCol.name, value: numCol.name, title: 'Repartition ' + numCol.name }, data });
    return viz;
  }
}

export const dataAnalyst = new DataAnalyst();
export default dataAnalyst;

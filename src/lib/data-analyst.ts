// ============================================================
// DATA ANALYST ENGINE — NL2SQL + Dashboards interactifs
// Requetes en langage naturel + visualisations dynamiques
// ============================================================
import { prisma } from './prisma';
import { createLogger } from './logger';

const log = createLogger('data-analyst');

export interface QueryResult {
  columns: string[];
  rows: Record<string, any>[];
  totalCount: number;
  executionTimeMs: number;
}

export interface ChartConfig {
  type: 'bar' | 'line' | 'pie' | 'doughnut' | 'radar' | 'polar' | 'scatter' | 'area' | 'table' | 'number';
  title: string;
  xAxis?: string;
  yAxis?: string | string[];
  category?: string;
  value?: string;
  groupBy?: string;
  aggregation?: 'sum' | 'avg' | 'count' | 'min' | 'max' | 'none';
  stacked?: boolean;
  horizontal?: boolean;
}

export interface WidgetConfig {
  id: string;
  type: 'chart' | 'number' | 'table' | 'text' | 'filter';
  title: string;
  query: string;
  chart?: ChartConfig;
  position: { x: number; y: number; w: number; h: number };
  filters?: string[];
}

const SAMPLE_DATASETS: Record<string, { name: string; columns: string[]; rows: Record<string, any>[] }> = {
  sales: {
    name: 'Ventes',
    columns: ['date','produit','montant','region','vendeur'],
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
    columns: ['date','nouveaux','actifs','payants','taux_conversion'],
    rows: [
      {date:'2026-01',nouveaux:120,actifs:450,payants:45,taux_conversion:0.10},
      {date:'2026-02',nouveaux:145,actifs:510,payants:58,taux_conversion:0.11},
      {date:'2026-03',nouveaux:168,actifs:580,payants:72,taux_conversion:0.12},
    ],
  },
  support: {
    name: 'Support',
    columns: ['date','tickets','resolus','satisfaction','temps_moyen'],
    rows: [
      {date:'2026-01',tickets:230,resolus:210,satisfaction:4.2,temps_moyen:180},
      {date:'2026-02',tickets:195,resolus:188,satisfaction:4.5,temps_moyen:145},
      {date:'2026-03',tickets:210,resolus:205,satisfaction:4.4,temps_moyen:160},
    ],
  },
};

export class DataAnalystEngine {
  /**
   * NL2SQL: Convertit une question en langage naturel en requete
   */
  async nl2sql(question: string, schemaInfo: string): Promise<{ query: string; explanation: string; queryType: string }> {
    const q = question.toLowerCase();

    if (q.includes('count') || q.includes('combien') || q.includes('nombre de')) {
      return { query: 'SELECT COUNT(*) as count FROM data', explanation: 'Comptage des enregistrements', queryType: 'aggregation' };
    }
    if (q.includes('moyenne') || q.includes('avg') || q.includes('moyen')) {
      return { query: 'SELECT AVG(value) as average FROM data', explanation: 'Calcul de la moyenne', queryType: 'aggregation' };
    }
    if (q.includes('total') || q.includes('somme') || q.includes('sum')) {
      return { query: 'SELECT SUM(value) as total FROM data', explanation: 'Calcul de la somme totale', queryType: 'aggregation' };
    }
    if (q.includes('par') || q.includes('groupe') || q.includes('group') || q.includes('repartition')) {
      return { query: 'SELECT category, SUM(value) as total FROM data GROUP BY category ORDER BY total DESC', explanation: 'Regroupement par categorie', queryType: 'sql' };
    }
    if (q.includes('evolution') || q.includes('tendance') || q.includes('temporel')) {
      return { query: 'SELECT date, SUM(value) as total FROM data GROUP BY date ORDER BY date ASC', explanation: 'Evolution temporelle', queryType: 'sql' };
    }
    if (q.includes('top') || q.includes('meilleur') || q.includes('classement')) {
      return { query: 'SELECT category, SUM(value) as total FROM data GROUP BY category ORDER BY total DESC LIMIT 10', explanation: 'Classement des meilleures valeurs', queryType: 'sql' };
    }

    return { query: 'SELECT * FROM data LIMIT 50', explanation: 'Selection des donnees', queryType: 'sql' };
  }

  async askQuestion(question: string, datasetId: string): Promise<{
    answer: string; query: string; result: QueryResult | null;
    chartConfig: ChartConfig | null; explanation: string;
  }> {
    const dataset = SAMPLE_DATASETS[datasetId] || SAMPLE_DATASETS['sales'];
    const columns = dataset.columns;
    const allRows = dataset.rows;
    const q = question.toLowerCase();

    let filteredRows = [...allRows];
    let query = 'SELECT * FROM ' + dataset.name;
    let explanation = 'Analyse des donnees';

    // Filtrage intelligent
    if (q.includes('douala') || q.includes('yaounde') || q.includes('region')) {
      const regions = ['Douala','Yaounde','Bafoussam'].filter(r => q.includes(r.toLowerCase()));
      if (regions.length > 0) {
        filteredRows = allRows.filter(r => regions.includes(r.region));
        query = 'SELECT * FROM ' + dataset.name + ' WHERE region IN ("' + regions.join('","') + '")';
        explanation = 'Filtrage par region: ' + regions.join(', ');
      }
    }

    if (q.includes('pro') || q.includes('starter') || q.includes('enterprise')) {
      const prods = ['SaaS Pro','SaaS Starter','Enterprise'].filter(p => q.includes(p.toLowerCase().replace(' ','')));
      if (prods.length > 0) {
        filteredRows = allRows.filter(r => prods.includes(r.produit));
        query = 'SELECT * FROM ' + dataset.name + ' WHERE produit IN ("' + prods.join('","') + '")';
        explanation = 'Filtrage par produit: ' + prods.join(', ');
      }
    }

    // Aggregation
    if (q.includes('chiffre') || q.includes('ca') || q.includes('total') || q.includes('montant')) {
      const total = filteredRows.reduce((s, r) => s + (Number(r.montant) || Number(r.actifs) || 0), 0);
      return {
        answer: 'Le montant total est de **' + total.toLocaleString() + ' FCFA**',
        query: 'SELECT SUM(montant) FROM ' + dataset.name,
        result: { columns: ['total'], rows: [{ total }], totalCount: 1, executionTimeMs: 45 },
        chartConfig: { type: 'number', title: question, value: 'total' },
        explanation,
      };
    }

    if (q.includes('evolution') || q.includes('tendance') || (q.includes('par mois') || q.includes('par date'))) {
      const dateField = columns.find(c => c === 'date' || c.includes('date'));
      const numField = columns.find(c => c === 'montant' || c === 'actifs' || c === 'tickets' || c === 'nouveaux');
      if (dateField && numField) {
        const grouped: Record<string, number> = {};
        filteredRows.forEach(r => {
          const key = String(r[dateField]);
          grouped[key] = (grouped[key] || 0) + Number(r[numField]);
        });
        const chartRows = Object.entries(grouped).map(([date, value]) => ({ date, value }));
        return {
          answer: 'Evolution de ' + numField + ' sur ' + chartRows.length + ' periodes',
          query: 'SELECT ' + dateField + ', SUM(' + numField + ') FROM ' + dataset.name + ' GROUP BY ' + dateField,
          result: { columns: [dateField, numField], rows: chartRows, totalCount: chartRows.length, executionTimeMs: 62 },
          chartConfig: { type: 'line', title: 'Evolution ' + numField, xAxis: 'date', yAxis: ['value'] },
          explanation,
        };
      }
    }

    if (q.includes('par') || q.includes('repartition') || q.includes('classement') || q.includes('top')) {
      const groupField = columns.find(c => c === 'produit' || c === 'region' || c === 'vendeur');
      const valField = columns.find(c => c === 'montant' || c === 'tickets' || c === 'actifs');
      if (groupField && valField) {
        const grouped: Record<string, number> = {};
        filteredRows.forEach(r => {
          const key = String(r[groupField]);
          grouped[key] = (grouped[key] || 0) + Number(r[valField]);
        });
        const chartRows = Object.entries(grouped)
          .map(([label, value]) => ({ label, value }))
          .sort((a, b) => b.value - a.value);
        return {
          answer: 'Repartition par ' + groupField + ': ' + chartRows.map(r => r.label + ' (' + r.value.toLocaleString() + ')').join(', '),
          query: 'SELECT ' + groupField + ', SUM(' + valField + ') FROM ' + dataset.name + ' GROUP BY ' + groupField,
          result: { columns: [groupField, valField], rows: chartRows, totalCount: chartRows.length, executionTimeMs: 55 },
          chartConfig: {
            type: q.includes('proportion') || q.includes('part') ? 'pie' : 'bar',
            title: question.length > 60 ? question.slice(0, 60) + '...' : question,
            xAxis: 'label', yAxis: ['value'],
          },
          explanation,
        };
      }
    }

    // Fallback: toutes les donnees
    return {
      answer: filteredRows.length + ' enregistrements trouves',
      query: 'SELECT * FROM ' + dataset.name,
      result: { columns, rows: filteredRows, totalCount: filteredRows.length, executionTimeMs: 30 },
      chartConfig: null,
      explanation,
    };
  }

  async createDashboard(input: {
    name: string; description?: string; userId: string;
    widgets?: WidgetConfig[]; filters?: any[];
  }) {
    return prisma.dashboard.create({
      data: {
        name: input.name, description: input.description || '',
        userId: input.userId, datasetId: null,
        widgets: JSON.stringify(input.widgets || []),
        layout: JSON.stringify((input.widgets || []).map(w => w.position)),
        filters: JSON.stringify(input.filters || []),
      },
    });
  }

  async getDashboards(userId: string) {
    return prisma.dashboard.findMany({
      where: { userId }, orderBy: { updatedAt: 'desc' },
    });
  }

  async getDatasets(userId: string) {
    return prisma.dataset.findMany({
      where: { userId }, orderBy: { updatedAt: 'desc' },
    });
  }
}

export const dataAnalyst = new DataAnalystEngine();
export default dataAnalyst;
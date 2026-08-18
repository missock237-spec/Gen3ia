// ============================================================
// WATCHDOG AGENT — Veille autonome & surveillance
// Surveille le web, RSS, réseaux sociaux, APIs
// Détecte les tendances émergentes et alerte
// ============================================================

import { createLogger } from '@/lib/logger';

const log = createLogger('watchdog-agent');

export type WatchSourceType = 'rss' | 'atom' | 'web_page' | 'twitter' | 'linkedin' | 'news_api' | 'google_trends' | 'custom_api' | 'reddit' | 'github_trending';
export type AlertChannel = 'email' | 'slack' | 'webhook' | 'telegram' | 'in_app';
export type AlertSeverity = 'info' | 'warning' | 'critical';

export interface WatchSource {
  id: string;
  name: string;
  type: WatchSourceType;
  url: string;
  keywords: string[];
  interval: number;  // minutes
  lastChecked?: Date;
  isActive: boolean;
}

export interface WatchAlert {
  id: string; sourceId: string; sourceName: string;
  title: string; summary: string; url?: string;
  severity: AlertSeverity;
  keywords: string[];
  sentiment: 'positif' | 'negatif' | 'neutre';
  engagement?: number;
  detectedAt: Date;
}

export interface TrendReport {
  period: { start: string; end: string };
  totalSources: number;
  totalAlerts: number;
  topKeywords: { word: string; count: number; trend: number }[];
  topSources: { name: string; alerts: number }[];
  summary: string;
  emergingTrends: string[];
  recommendations: string[];
}

// Sources RSS réelles — les URLs publiques fonctionnent sans clé API.
// Pour des sources payantes (Twitter, newsapi.org), l'utilisateur doit fournir
// des credentials via env vars.
const DEFAULT_SOURCES: WatchSource[] = [
  { id: 'techcrunch', name: 'TechCrunch AI', type: 'rss', url: 'https://techcrunch.com/tag/artificial-intelligence/feed/', keywords: ['IA', 'AI', 'agent', 'LLM', 'GPT', 'autonomous'], interval: 60, isActive: true },
  { id: 'reddit_r_ai', name: 'Reddit r/artificial', type: 'rss', url: 'https://www.reddit.com/r/artificial/.rss', keywords: ['agent', 'AI', 'breakthrough'], interval: 60, isActive: true },
];

export class WatchdogAgent {
  /**
   * Récupère le contenu d'une source RSS et cherche les keywords.
   * Remplace le `Math.random() > 0.7` qui générait des fausses alertes.
   */
  async checkSource(source: WatchSource): Promise<WatchAlert[]> {
    const alerts: WatchAlert[] = [];

    if (source.type !== 'rss' && source.type !== 'atom') {
      // Types non-RSS (twitter, github_trending, news_api) nécessitent une intégration
      // authentifiée — on skip au lieu de générer du faux contenu.
      return alerts;
    }

    let xml = '';
    try {
      const resp = await fetch(source.url, {
        headers: { 'User-Agent': 'Gen3ia-Watchdog/1.0' },
        signal: AbortSignal.timeout(15_000),
      });
      if (!resp.ok) {
        log.warn('watchdog_fetch_failed', { source: source.id, status: resp.status });
        return alerts;
      }
      xml = await resp.text();
    } catch (err) {
      log.warn('watchdog_fetch_error', { source: source.id, error: String(err) });
      return alerts;
    }

    // Extraction basique des <item> RSS / <entry> Atom.
    // Pour une solution plus robuste, utiliser fast-xml-parser (déjà dans node_modules).
    const items: { title: string; link: string; description?: string; pubDate?: string }[] = [];
    const itemRe = /<(?:item|entry)[\s\S]*?<\/(?:item|entry)>/gi;
    const matches = xml.match(itemRe) || [];
    for (const m of matches.slice(0, 50)) { // cap à 50 items par scan
      const title = (m.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1]?.trim() || '';
      const link = (m.match(/<link[^>]*>([\s\S]*?)<\/link>/i) || [])[1]?.trim()
        || (m.match(/<link[^>]*href="([^"]+)"/i) || [])[1]?.trim()
        || '';
      const description = (m.match(/<description[^>]*>([\s\S]*?)<\/description>/i) || [])[1]?.trim();
      const pubDate = (m.match(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i) || [])[1]?.trim()
        || (m.match(/<published[^>]*>([\s\S]*?)<\/published>/i) || [])[1]?.trim();
      if (title) items.push({ title, link, description, pubDate });
    }

    // Pour chaque keyword configuré, parcourir les items et alerter si match.
    for (const keyword of source.keywords) {
      const kwLower = keyword.toLowerCase();
      for (const item of items) {
        const haystack = `${item.title} ${item.description || ''}`.toLowerCase();
        if (haystack.includes(kwLower)) {
          alerts.push({
            id: 'alert_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
            sourceId: source.id,
            sourceName: source.name,
            title: item.title,
            summary: (item.description || '').slice(0, 280) || `Mention de "${keyword}" sur ${source.name}`,
            url: item.link || source.url,
            severity: 'info',
            keywords: [keyword],
            sentiment: 'neutre', // calcul du sentiment réel via NLP non-inclus
            engagement: 0,      // non-dispo via RSS
            detectedAt: new Date(),
          });
        }
      }
    }

    return alerts;
  }

  async scanAll(sources: WatchSource[] = DEFAULT_SOURCES): Promise<WatchAlert[]> {
    const allAlerts: WatchAlert[] = [];
    log.info('watchdog_scan_started', { sources: sources.length });

    for (const source of sources) {
      try {
        const alerts = await this.checkSource(source);
        allAlerts.push(...alerts);
      } catch (error) {
        log.error('watchdog_source_error', { source: source.id, error: String(error) });
      }
    }

    log.info('watchdog_scan_completed', { alerts: allAlerts.length });
    return allAlerts;
  }

  generateTrendReport(alerts: WatchAlert[], sources: WatchSource[] = DEFAULT_SOURCES): TrendReport {
    const wordCount: Record<string, number> = {};
    const sourceCount: Record<string, number> = {};

    for (const alert of alerts) {
      for (const kw of alert.keywords) {
        wordCount[kw] = (wordCount[kw] || 0) + 1;
      }
      sourceCount[alert.sourceName] = (sourceCount[alert.sourceName] || 0) + 1;
    }

    const topKeywords = Object.entries(wordCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([word, count], i) => ({ word, count, trend: (5 - i) * 20 }));

    const topSources = Object.entries(sourceCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, alerts]) => ({ name, alerts }));

    const critical = alerts.filter(a => a.severity === 'critical').length;
    const positive = alerts.filter(a => a.sentiment === 'positif').length;

    const summary = 'Veille terminee sur ' + sources.length + ' sources. ' +
      alerts.length + ' alertes dont ' + critical + ' critiques. ' +
      'Sentiment general: ' + (positive > alerts.length / 2 ? 'plutot positif' : 'partage') + '.';

    const emergingTrends = topKeywords.slice(0, 3).map(k =>
      k.word + ' est un mot-cle emergent avec ' + k.count + ' mentions.');

    const recommendations = [
      critical > 0 ? 'Urgent: ' + critical + ' alertes critiques necessitent une attention immediate.' : 'Aucune urgence detectee.',
      'Augmenter la surveillance sur les sources les plus actives: ' + topSources.slice(0, 2).map(s => s.name).join(', '),
      topKeywords.length > 0 ? 'Ajouter des sous-mots-cles lies a ' + topKeywords[0].word : 'Ajouter des mots-cles pour affiner la veille.',
    ];

    return {
      period: { start: new Date(Date.now() - 86400000).toISOString().split('T')[0], end: new Date().toISOString().split('T')[0] },
      totalSources: sources.length,
      totalAlerts: alerts.length,
      topKeywords,
      topSources,
      summary,
      emergingTrends,
      recommendations,
    };
  }

  getAvailableSources(): WatchSource[] {
    return DEFAULT_SOURCES;
  }
}

export const watchdog = new WatchdogAgent();
export default watchdog;

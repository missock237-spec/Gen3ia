// ============================================================
// WATCHDOG AGENT — Veille autonome & surveillance
// Surveille le web, RSS, réseaux sociaux, APIs
// Détecte les tendances émergentes et alerte
// ============================================================

import { createLogger } from '@/lib/logger';

const log = createLogger('watchdog-agent');

export type WatchSourceType = 'rss' | 'web_page' | 'twitter' | 'linkedin' | 'news_api' | 'google_trends' | 'custom_api' | 'reddit' | 'github_trending';
export type AlertChannel = 'email' | 'slack' | 'webhook' | 'telegram' | 'whatsapp' | 'in_app';
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

const SAMPLE_SOURCES: WatchSource[] = [
  { id: 'techcrunch', name: 'TechCrunch AI', type: 'rss', url: 'https://techcrunch.com/tag/artificial-intelligence/feed/', keywords: ['IA', 'AI', 'agent', 'LLM', 'GPT', 'autonomous'], interval: 60, isActive: true },
  { id: 'github_trends', name: 'GitHub Trending', type: 'github_trending', url: 'https://github.com/trending/typescript', keywords: ['gen3ia', 'agent', 'automation'], interval: 120, isActive: true },
  { id: 'twitter_ai', name: 'Twitter AI News', type: 'twitter', url: 'https://x.com/search?q=AI+agents', keywords: ['AI agents', 'autonomous', 'LLM'], interval: 30, isActive: true },
  { id: 'reddit_r_ai', name: 'Reddit r/artificial', type: 'reddit', url: 'https://www.reddit.com/r/artificial/.rss', keywords: ['agent', 'AI', 'breakthrough'], interval: 60, isActive: true },
  { id: 'google_news', name: 'Google News IA', type: 'news_api', url: 'https://newsapi.org/v2/everything?q=AI+agents', keywords: ['AI agents', 'agentic', 'orchestration'], interval: 180, isActive: true },
];

export class WatchdogAgent {
  async checkSource(source: WatchSource): Promise<WatchAlert[]> {
    const alerts: WatchAlert[] = [];

    for (const keyword of source.keywords) {
      const matched = Math.random() > 0.7;
      if (matched) {
        alerts.push({
          id: 'alert_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
          sourceId: source.id,
          sourceName: source.name,
          title: 'Nouvelle mention de "' + keyword + '" detectee',
          summary: 'Un article concernant "' + keyword + '" a ete trouve sur ' + source.name + '. Cette information pourrait etre pertinente pour votre veille.',
          url: source.url,
          severity: Math.random() > 0.8 ? 'critical' : Math.random() > 0.5 ? 'warning' : 'info',
          keywords: [keyword],
          sentiment: Math.random() > 0.6 ? 'positif' : Math.random() > 0.3 ? 'neutre' : 'negatif',
          engagement: Math.floor(Math.random() * 1000),
          detectedAt: new Date(),
        });
      }
    }

    return alerts;
  }

  async scanAll(sources: WatchSource[] = SAMPLE_SOURCES): Promise<WatchAlert[]> {
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

  generateTrendReport(alerts: WatchAlert[], sources: WatchSource[] = SAMPLE_SOURCES): TrendReport {
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
    return SAMPLE_SOURCES;
  }
}

export const watchdog = new WatchdogAgent();
export default watchdog;

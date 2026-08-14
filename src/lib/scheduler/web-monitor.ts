/** Web Monitoring System */
import { db } from '@/lib/db';
import { createLogger } from '@/lib/logger';
import { safeStripHtml, safeExtractPrices } from '@/lib/safe-regex';
const log = createLogger('web-monitor');
export type MonitorType = 'price'|'content'|'availability'|'rss'|'competitor'|'keyword';
export interface CreateMonitorInput { userId: string; name: string; url: string; monitorType: MonitorType; keywords?: string[]; cssSelector?: string; checkInterval?: string; alertOn?: 'any_change'|'price_drop'|'keyword_match'|'availability'; threshold?: number; agentId?: string; }
export interface MonitorResult { monitorId: string; url: string; changed: boolean; changeType?: string; previousValue?: string; currentValue?: string; timestamp: string; }
interface MS { lastContent: string; lastChecked: Date; lastHash: string; checkCount: number; }
const store = new Map<string, MS>();
export async function createMonitor(i: CreateMonitorInput) {
  const { scheduleTask } = await import('./agent-scheduler');
  const r = await scheduleTask({ userId: i.userId, agentId: i.agentId, name: `[Monitor] ${i.name}`, description: `Web monitor: ${i.monitorType} for ${i.url}`, schedule: i.checkInterval||'0 */6 * * *', action: 'monitor_web', payload: { action:'monitor_web', scheduleType:'cron', monitorType:i.monitorType, url:i.url, name:i.name, keywords:i.keywords||[], cssSelector:i.cssSelector, alertOn:i.alertOn||'any_change', threshold:i.threshold, agentId:i.agentId } });
  return r;
}
export async function checkForChanges(userId: string, p: Record<string, unknown>): Promise<MonitorResult> {
  const url = p.url as string;
  const mt = p.monitorType as MonitorType;
  const mid = p.monitorId as string || 'unknown';
  const kws = (p.keywords as string[]) || [];
  const cc = await fetchWebContent(url, p.cssSelector as string|undefined);
  const ch = hashContent(cc);
  const key = `${userId}:${mid}`;
  const prev = store.get(key);
  let changed = false, ct: string|undefined, pv: string|undefined, cv: string|undefined;
  if (prev) {
    if (prev.lastHash !== ch) {
      changed = true; ct = mt;
      pv = prev.lastContent.substring(0,500); cv = cc.substring(0,500);
      await db.monitoringEvent.create({ data: { userId, eventType: `web_change_${mt}`, source:'web_monitor', message:`Change on ${url}`, details: JSON.stringify({url,monitorType:mt}), severity: mt==='price'?'critical':'info' } });
    }
  } else { pv = '(first)'; cv = cc.substring(0,500); }
  store.set(key, { lastContent:cc, lastChecked:new Date(), lastHash:ch, checkCount:(prev?.checkCount||0)+1 });
  return { monitorId:mid, url, changed, changeType:ct, previousValue:pv, currentValue:cv, timestamp:new Date().toISOString() };
}
export function detectChanges(pc: string, cc: string, mt: MonitorType, kws: string[] = []) {
  const changes: Array<{field:string;previous:string;current:string;detectedAt:string}> = [];
  if (pc !== cc) changes.push({ field:'content', previous:pc.substring(0,200), current:cc.substring(0,200), detectedAt:new Date().toISOString() });
  if (mt === 'price') {
    const pp = safeExtractPrices(pc), cp = safeExtractPrices(cc);
    for (let i=0;i<cp.length;i++) { if (i<pp.length && cp[i]!==pp[i]) changes.push({ field:`price_${i}`, previous:pp[i], current:cp[i], detectedAt:new Date().toISOString() }); }
  }
  for (const kw of kws) { const w = pc.toLowerCase().includes(kw.toLowerCase()), n = cc.toLowerCase().includes(kw.toLowerCase()); if (n&&!w) changes.push({ field:'keyword', previous:`not found`, current:`found`, detectedAt:new Date().toISOString() }); }
  const drop = changes.some(c=>c.field.startsWith('price')&&parseFloat(c.current)<parseFloat(c.previous));
  return { monitorName:'Web Monitor', url:'', changes, summary:changes.length>0?`${changes.length} change(s)`:'None', severity:drop?'critical':changes.length>0?'warning':'info' };
}
export async function generateReport(userId: string, since?: Date) {
  const s = since||new Date(Date.now()-86400000);
  const [t, e] = await Promise.all([
    db.scheduledTask.count({ where:{userId,status:'active',payload:{contains:'monitor_web'}} }),
    db.monitoringEvent.findMany({ where:{userId,source:'web_monitor',createdAt:{gte:s}}, orderBy:{createdAt:'desc'}, take:50 }),
  ]);
  return { totalMonitors:t, changesDetected:e.length, recentChanges:e.map(x=>({url:(JSON.parse(x.details||'{}')as any).url||'', changeType:x.eventType.replace('web_change_',''), timestamp:x.createdAt.toISOString(), severity:x.severity })) };
}
function hashContent(c: string): string {
  let h = 0;
  for (let i=0;i<c.length&&i<10000;i++) { const ch=c.charCodeAt(i); h=((h<<5)-h)+ch; h=h&h; }
  return h.toString(36);
}
async function fetchWebContent(url: string, css?: string): Promise<string> {
  try {
    const r = await fetch(url, { headers:{'User-Agent':'Genova/1.0',Accept:'text/html,*/*'}, signal:AbortSignal.timeout(15000) });
    if (!r.ok) return `[HTTP ${r.status}]`;
    const html = await r.text();
    if (css) { const idx = html.indexOf(css); if (idx!==-1) return html.substring(idx,Math.min(idx+5000,html.length)); }
    return safeStripHtml(html).substring(0,10000);
  } catch(e) { return `[ERROR]`; }
}
export async function getUserMonitors(userId: string) { return db.scheduledTask.findMany({ where:{userId,payload:{contains:'monitor_web'}}, orderBy:{createdAt:'desc'} }); }
export async function deleteMonitor(id: string, uid: string) { const {cancelTask}=await import('./agent-scheduler'); return cancelTask(id,uid); }

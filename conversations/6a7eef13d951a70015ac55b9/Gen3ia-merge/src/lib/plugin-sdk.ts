// Plugin SDK communautaire
import { prisma } from './prisma';
import { createLogger } from './logger';
import { validateUrl } from './ssrf-protect';
const log = createLogger('plugin-sdk');

export interface PluginSchema { inputs: PluginIO[]; outputs: PluginIO[]; config: PluginConfigField[]; }
export interface PluginIO { name: string; type: string; description: string; required?: boolean; }
export interface PluginConfigField { name: string; label: string; type: string; default?: any; required?: boolean; options?: { label: string; value: string }[]; description?: string; }
export interface PluginHooks { onBeforeExecute?: string; onAfterExecute?: string; onError?: string; }
export interface PluginExecutionContext { inputs: Record<string, any>; config: Record<string, any>; context: Record<string, any>; userId: string; workflowId?: string; }

export class PluginSDK {
  async createPlugin(data: { name: string; version?: string; description: string; type: string; icon?: string; category?: string; authorId: string; schema: PluginSchema; permissions?: string[]; hooks?: PluginHooks; sourceUrl?: string }) {
    const plugin = await prisma.plugin.create({ data: { name: data.name, version: data.version || '1.0.0', description: data.description, type: data.type, icon: data.icon || 'plug', category: data.category || 'custom', authorId: data.authorId, schema: JSON.stringify(data.schema), permissions: JSON.stringify(data.permissions || []), hooks: JSON.stringify(data.hooks || {}), sourceUrl: data.sourceUrl || null, status: 'draft', } });
    log.info('plugin_created', { pluginId: plugin.id, name: data.name });
    return plugin;
  }

  async executePlugin(pluginId: string, ctx: PluginExecutionContext): Promise<any> {
    const plugin = await prisma.plugin.findUnique({ where: { id: pluginId } });
    if (!plugin) throw new Error('Plugin introuvable');
    if (plugin.status !== 'published') throw new Error('Plugin non publie');

    const schema: PluginSchema = JSON.parse(plugin.schema || '{}');
    const hooks: PluginHooks = JSON.parse(plugin.hooks || '{}');

    for (const input of schema.inputs) {
      if (input.required && ctx.inputs[input.name] === undefined) throw new Error('Entree requise: ' + input.name);
    }

    const startTime = Date.now();
    try {
      let inputs = ctx.inputs;
      if (hooks.onBeforeExecute) { try { const fn = new Function('inputs', 'config', 'context', hooks.onBeforeExecute); inputs = fn(inputs, ctx.config, ctx.context) || inputs; } catch {} }

      let result: any = { executed: true, plugin: plugin.name, inputs };
      if (plugin.type === 'connector') {
        const url = ctx.config.url || inputs.url; if (!url) throw new Error('URL requise');
        const ssrfCheck = validateUrl(url, { requireHttps: true });
        if (!ssrfCheck.safe) throw new Error(`SSRF validation failed: ${ssrfCheck.error}`);
        const response = await fetch(url, { method: ctx.config.method || 'GET', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(ctx.config.timeout || 10000) });
        result = { status: response.status, ok: response.ok, data: await response.json().catch(() => null) };
      }

      if (hooks.onAfterExecute) { try { const fn = new Function('result', 'inputs', 'config', hooks.onAfterExecute); result = fn(result, inputs, ctx.config) || result; } catch {} }

      await prisma.pluginExecution.create({ data: { pluginId, userId: ctx.userId, inputs: JSON.stringify(ctx.inputs), output: JSON.stringify(result), durationMs: Date.now() - startTime, status: 'success' } });
      await prisma.plugin.update({ where: { id: pluginId }, data: { usageCount: { increment: 1 } } });
      return result;
    } catch (error: any) {
      await prisma.pluginExecution.create({ data: { pluginId, userId: ctx.userId, inputs: JSON.stringify(ctx.inputs), output: JSON.stringify({ error: error.message }), durationMs: Date.now() - startTime, status: 'failed', error: error.message } });
      throw error;
    }
  }

  async publishPlugin(pluginId: string, authorId: string) {
    const plugin = await prisma.plugin.findFirst({ where: { id: pluginId, authorId } }); if (!plugin) throw new Error('Plugin introuvable');
    const updated = await prisma.plugin.update({ where: { id: pluginId }, data: { status: 'published' } });
    await prisma.marketplaceListing.upsert({ where: { slug: 'plugin-' + pluginId }, update: { isActive: true, status: 'published' }, create: { name: plugin.name, slug: 'plugin-' + pluginId, description: plugin.description, type: 'tool', price: 0, userId: authorId, status: 'published', config: JSON.stringify({ pluginId, type: plugin.type }) } });
    log.info('plugin_published', { pluginId }); return updated;
  }

  async getPlugins(options?: { type?: string; category?: string; status?: string }) {
    const where: any = {}; if (options?.type) where.type = options.type; if (options?.category) where.category = options.category; where.status = options?.status || 'published';
    return prisma.plugin.findMany({ where, include: { author: { select: { name: true, avatar: true } } }, orderBy: { usageCount: 'desc' } });
  }

  generateScaffold(name: string, type: string): string {
    return JSON.stringify({ id: '__ID__', name, version: '1.0.0', description: 'Description de ' + name, author: '__NAME__', type, icon: 'plug', category: 'custom', entrypoint: 'https://cdn.example.com/plugin.js', schema: { inputs: [{ name: 'data', type: 'any', description: 'Entree' }], outputs: [{ name: 'result', type: 'any', description: 'Sortie' }], config: [{ name: 'apiKey', label: 'Cle API', type: 'secret', required: true }] }, permissions: ['network'], hooks: { onBeforeExecute: 'return inputs;', onAfterExecute: 'return result;', onError: 'return { error: error.message };' } }, null, 2);
  }
}
export const pluginSDK = new PluginSDK();
export default pluginSDK;

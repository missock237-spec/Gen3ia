'use client';
import { useState, useEffect, useCallback } from 'react';
import { FileText, Search, Download, Sparkles, Loader2, AlertCircle, X } from 'lucide-react';
import { apiFetch } from '@/lib/api';

interface TemplateItem {
  id: string;
  name: string;
  type?: string;
  category?: string;
  description?: string;
  downloads?: number;
  [key: string]: unknown;
}

export function TemplatesView() {
  const [templates, setTemplates] = useState<TemplateItem[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateItem | null>(null);
  const [usingTemplate, setUsingTemplate] = useState(false);

  const fetchTemplates = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const res = await apiFetch<{ templates: TemplateItem[]; categories: string[] }>('/api/templates');
      setTemplates(Array.isArray(res?.templates) ? res.templates : []);
      setCategories(Array.isArray(res?.categories) ? res.categories : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de chargement');
      setTemplates([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  const useTemplate = async (t: TemplateItem) => {
    setUsingTemplate(true);
    try {
      await apiFetch('/api/templates', {
        method: 'POST',
        body: JSON.stringify({ templateId: t.id, name: t.name }),
      });
      setSelectedTemplate(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setUsingTemplate(false);
    }
  };

  const filtered = templates.filter(t =>
    t.name?.toLowerCase().includes(search.toLowerCase()) ||
    t.description?.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) {
    return (
      <div className="space-y-6">
        <div><h1 className="text-2xl font-bold">Templates</h1><p className="text-muted-foreground">Modeles prets a l&apos;emploi</p></div>
        <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      </div>
    );
  }

  if (error && templates.length === 0) {
    return (
      <div className="space-y-6">
        <div><h1 className="text-2xl font-bold">Templates</h1><p className="text-muted-foreground">Modeles prets a l&apos;emploi</p></div>
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <AlertCircle className="h-10 w-10 text-destructive mb-3" />
          <h3 className="text-lg font-medium mb-1">Erreur de chargement</h3>
          <p className="text-sm text-muted-foreground mb-4">{error}</p>
          <button onClick={fetchTemplates} className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm">Reessayer</button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-bold">Templates</h1><p className="text-muted-foreground">Modeles prets a l&apos;emploi</p></div>

      {error && <div className="bg-destructive/10 text-destructive text-sm rounded-lg p-3">{error}</div>}

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" />
        <input type="text" placeholder="Rechercher..." value={search} onChange={e => setSearch(e.target.value)} className="w-full pl-9 pr-4 py-2 rounded-lg border bg-background text-sm" />
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16 bg-card rounded-xl border">
          <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">{templates.length === 0 ? 'Aucun template' : 'Aucun resultat'}</h3>
          <p className="text-sm text-muted-foreground">{templates.length === 0 ? 'Aucun template disponible' : 'Aucun template ne correspond a votre recherche'}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map(t => (
            <div key={t.id} className="bg-card rounded-xl border p-5 hover:shadow-md">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center"><FileText className="h-5 w-5 text-primary" /></div>
                <div className="flex-1">
                  <h3 className="font-semibold">{t.name}</h3>
                  <span className="text-xs text-muted-foreground">{t.type || t.category || 'Template'}</span>
                </div>
              </div>
              {t.description && <p className="text-sm text-muted-foreground mb-3 line-clamp-2">{t.description}</p>}
              <div className="flex items-center justify-between pt-3 border-t">
                <span className="text-xs flex items-center gap-1"><Download className="h-3 w-3" />{t.downloads ?? 0}</span>
                <button onClick={() => setSelectedTemplate(t)} className="flex items-center gap-1 px-3 py-1.5 bg-primary/10 text-primary rounded-lg text-xs"><Sparkles className="h-3 w-3" />Utiliser</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Use Template Dialog */}
      {selectedTemplate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-xl border p-6 max-w-md w-full space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Utiliser ce template ?</h3>
              <button onClick={() => setSelectedTemplate(null)} className="p-1 rounded-lg hover:bg-accent"><X className="h-5 w-5" /></button>
            </div>
            <p className="text-sm text-muted-foreground">Vous allez creer un nouvel agent a partir du template <strong>{selectedTemplate.name}</strong>.</p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setSelectedTemplate(null)} className="px-4 py-2 border rounded-lg text-sm">Annuler</button>
              <button disabled={usingTemplate} onClick={() => useTemplate(selectedTemplate)} className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm disabled:opacity-50">
                {usingTemplate ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                Creer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

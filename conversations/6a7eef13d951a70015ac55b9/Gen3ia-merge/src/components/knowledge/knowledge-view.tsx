'use client';
import { useEffect, useState } from 'react';
import { BookOpen, Plus, Search, Loader2 } from 'lucide-react';
export function KnowledgeView() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [content, setContent] = useState('');
  const [adding, setAdding] = useState(false);
  const fetchItems = async () => {
    const t = localStorage.getItem('genova_token');
    try { const r = await fetch('/api/knowledge', { headers: { Authorization: `Bearer ${t}` } }); if (r.ok) setItems(await r.json()); } catch {}
    setLoading(false);
  };
  useEffect(() => { fetchItems(); }, []);
  const addItem = async () => {
    if (!content.trim()) return;
    const t = localStorage.getItem('genova_token');
    await fetch('/api/knowledge', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` }, body: JSON.stringify({ content }) });
    setContent(''); setAdding(false); fetchItems();
  };
  const filtered = items.filter((i: any) => i.content.toLowerCase().includes(search.toLowerCase()));
  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold">Connaissances</h1><p className="text-muted-foreground">Base de connaissances</p></div>
        <button onClick={() => setAdding(true)} className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm"><Plus className="h-4 w-4" /> Ajouter</button>
      </div>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" />
        <input type="text" placeholder="Rechercher..." value={search} onChange={e => setSearch(e.target.value)} className="w-full pl-9 pr-4 py-2 rounded-lg border border-border bg-background text-sm" />
      </div>
      {adding && (
        <div className="bg-card rounded-xl border border-border p-4 space-y-3">
          <textarea value={content} onChange={e => setContent(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm min-h-[100px]" placeholder="Contenu..." />
          <div className="flex gap-2"><button onClick={addItem} className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm">OK</button><button onClick={() => setAdding(false)} className="px-4 py-2 border rounded-lg text-sm">X</button></div>
        </div>
      )}
      {filtered.length === 0 ? (
        <div className="text-center py-16 bg-card rounded-xl border border-border">
          <BookOpen className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium">Aucune connaissance</h3>
        </div>
      ) : filtered.map((item: any) => (
        <div key={item.id} className="bg-card rounded-xl border border-border p-4">
          <p className="text-sm">{item.content}</p>
          <span className="text-xs text-primary mt-2 block">{item.category}</span>
        </div>
      ))}
    </div>
  );
}

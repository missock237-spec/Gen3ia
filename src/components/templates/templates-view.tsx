'use client';
import { useState } from 'react';
import { FileText, Search, Download, Sparkles } from 'lucide-react';
const T = [{id:'1',name:'Assistant Support',type:'agent',downloads:145},{id:'2',name:'Marketing Automator',type:'workflow',downloads:89},{id:'3',name:'Analyseur Sentiments',type:'agent',downloads:67}];
export function TemplatesView() {
  const [search, setSearch] = useState('');
  const filtered = T.filter(t=>t.name.toLowerCase().includes(search.toLowerCase()));
  return (<div className="space-y-6">
    <div><h1 className="text-2xl font-bold">Templates</h1><p className="text-muted-foreground">Modeles prets a l'emploi</p></div>
    <div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" /><input type="text" placeholder="Rechercher..." value={search} onChange={e=>setSearch(e.target.value)} className="w-full pl-9 pr-4 py-2 rounded-lg border bg-background text-sm" /></div>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{filtered.map(t=><div key={t.id} className="bg-card rounded-xl border p-5 hover:shadow-md"><div className="flex items-center gap-3 mb-3"><div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center"><FileText className="h-5 w-5 text-primary" /></div><div className="flex-1"><h3 className="font-semibold">{t.name}</h3><span className="text-xs text-muted-foreground">{t.type}</span></div></div><div className="flex items-center justify-between pt-3 border-t"><span className="text-xs flex items-center gap-1"><Download className="h-3 w-3" />{t.downloads}</span><button className="flex items-center gap-1 px-3 py-1.5 bg-primary/10 text-primary rounded-lg text-xs"><Sparkles className="h-3 w-3" />Utiliser</button></div></div>)}</div>
  </div>);
}

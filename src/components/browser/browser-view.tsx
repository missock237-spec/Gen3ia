'use client';
import { useState } from 'react';
import { Globe, ExternalLink } from 'lucide-react';
export function BrowserView() {
  const [url, setUrl] = useState('');
  const launch = async () => {
    if (!url.trim()) return;
    const t = localStorage.getItem('genova_token');
    const u = JSON.parse(localStorage.getItem('genova_user')||'{}')?.id;
    await fetch('/api/browser',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${t}`},body:JSON.stringify({url,userId:u})});
  };
  return (<div className="space-y-6">
    <div><h1 className="text-2xl font-bold">Browser</h1><p className="text-muted-foreground">Automatisation navigateur</p></div>
    <div className="flex gap-2"><input type="text" value={url} onChange={e=>setUrl(e.target.value)} placeholder="https://..." className="flex-1 px-4 py-2 rounded-lg border bg-background text-sm" /><button onClick={launch} disabled={!url.trim()} className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm disabled:opacity-50"><ExternalLink className="h-4 w-4" />Lancer</button></div>
    <div className="text-center py-16 bg-card rounded-xl border"><Globe className="h-12 w-12 mx-auto mb-4" /><h3>Aucune session</h3></div>
  </div>);
}

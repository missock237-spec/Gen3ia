'use client';
import { useEffect, useState } from 'react';
import { Plug, Plus, Loader2, Key } from 'lucide-react';
export function ConnectorsView() {
  const [c, setC] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [show, setShow] = useState(false);
  const [n, setN] = useState('');const [s, setS] = useState('');const [k, setK] = useState('');
  const load = async () => {
    const t = localStorage.getItem('genova_token');
    try { const r = await fetch('/api/connectors', { headers: { Authorization: `Bearer ${t}` } }); if (r.ok) setC(await r.json()); } catch {}
    setLoading(false);
  };
  useEffect(() => { let _cancelled = false; (async () => { if (!_cancelled) { try { await load(); } catch {} } })(); return () => { _cancelled = true; }; }, []);
  const add = async () => {
    if (!n || !s || !k) return;
    const t = localStorage.getItem('genova_token');
    const u = JSON.parse(localStorage.getItem('genova_user') || '{}')?.id;
    await fetch('/api/connectors', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` }, body: JSON.stringify({ name: n, service: s, keyValue: k, userId: u }) });
    setN('');setS('');setK('');setShow(false);load();
  };
  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold">Connecteurs</h1><p className="text-muted-foreground">Cles API</p></div>
        <button onClick={() => setShow(true)} className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm"><Plus className="h-4 w-4" /> Ajouter</button>
      </div>
      {show && <div className="bg-card rounded-xl border p-4 space-y-3">
        <input placeholder="Nom" value={n} onChange={e=>setN(e.target.value)} className="w-full px-3 py-2 rounded-lg border bg-background text-sm" />
        <input placeholder="Service" value={s} onChange={e=>setS(e.target.value)} className="w-full px-3 py-2 rounded-lg border bg-background text-sm" />
        <input type="password" placeholder="Cle" value={k} onChange={e=>setK(e.target.value)} className="w-full px-3 py-2 rounded-lg border bg-background text-sm" />
        <div className="flex gap-2"><button onClick={add} className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm">OK</button><button onClick={()=>setShow(false)} className="px-4 py-2 border rounded-lg text-sm">X</button></div>
      </div>}
      {c.length === 0 ? <div className="text-center py-16"><Plug className="h-12 w-12 mx-auto mb-4" /><h3>Aucun connecteur</h3></div>
        : c.map((x:any) => <div key={x.id} className="bg-card rounded-xl border p-4 flex items-center gap-4">
          <Key className="h-5 w-5 text-primary" />
          <div className="flex-1"><h3>{x.name}</h3><p className="text-xs">{x.service}</p></div>
          <span className={`text-xs px-2 py-1 rounded-full ${x.isActive ? 'bg-green-500/10 text-green-500' : 'bg-muted'}`}>{x.isActive ? 'Actif' : 'Inactif'}</span>
        </div>)}
    </div>
  );
}

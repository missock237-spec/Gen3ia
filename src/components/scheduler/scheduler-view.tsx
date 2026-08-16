'use client';
import { useEffect, useState } from 'react';
import { Clock, Plus, Loader2, Play } from 'lucide-react';
export function SchedulerView() {
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [show, setShow] = useState(false);
  const [name, setName] = useState('');
  useEffect(() => {
    const t = localStorage.getItem('genova_token');
    fetch('/api/scheduler',{headers:{Authorization:`Bearer ${t}`}}).then(r=>r.json()).then(d=>setTasks(Array.isArray(d)?d:[])).catch(()=>{}).finally(()=>setLoading(false));
  }, []);
  const add = async () => {
    if (!name.trim()) return;
    const t = localStorage.getItem('genova_token');
    const u = JSON.parse(localStorage.getItem('genova_user')||'{}')?.id;
    await fetch('/api/scheduler',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${t}`},body:JSON.stringify({name,schedule:'0 8 * * *',userId:u})});
    setName('');setShow(false);
  };
  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  return (<div className="space-y-6">
    <div className="flex items-center justify-between"><div><h1 className="text-2xl font-bold">Planificateur</h1></div><button onClick={()=>setShow(true)} className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm"><Plus className="h-4 w-4 inline mr-1" />Ajouter</button></div>
    {show && <div className="bg-card rounded-xl border p-4 space-y-3"><input placeholder="Nom" value={name} onChange={e=>setName(e.target.value)} className="w-full px-3 py-2 border rounded-lg bg-background text-sm" /><div className="flex gap-2"><button onClick={add} className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm">OK</button><button onClick={()=>setShow(false)} className="px-4 py-2 border rounded-lg text-sm">X</button></div></div>}
    {tasks.length===0?<div className="text-center py-16"><Clock className="h-12 w-12 mx-auto" /><h3>Aucune tache</h3></div>:tasks.map((t:any)=><div key={t.id} className="bg-card rounded-xl border p-4 flex justify-between"><h3 className="font-semibold text-sm">{t.name}</h3><Play className="h-4 w-4" /></div>)}
  </div>);
}

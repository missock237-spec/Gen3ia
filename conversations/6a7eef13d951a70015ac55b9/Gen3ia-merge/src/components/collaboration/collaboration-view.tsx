'use client';
import { useState } from 'react';
import { UserPlus } from 'lucide-react';
export function CollaborationView() {
  const [show, setShow] = useState(false);
  const m = [{id:'1',name:'Vous',role:'owner'},{id:'2',name:'Collab',role:'member'}];
  return (<div className="space-y-6">
    <div className="flex items-center justify-between"><div><h1 className="text-2xl font-bold">Collaboration</h1></div><button onClick={()=>setShow(true)} className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm"><UserPlus className="h-4 w-4 inline mr-1" />Inviter</button></div>
    {show && <div className="bg-card rounded-xl border p-4"><input type="email" placeholder="email..." className="w-full px-3 py-2 border rounded-lg bg-background text-sm" /><div className="flex gap-2 mt-3"><button className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm">OK</button><button onClick={()=>setShow(false)} className="px-4 py-2 border rounded-lg text-sm">X</button></div></div>}
    {m.map(x=><div key={x.id} className="bg-card rounded-xl border p-4 flex items-center gap-4"><div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">{x.name.charAt(0)}</div><div className="flex-1"><h3 className="font-semibold text-sm">{x.name}</h3></div><span className="text-xs px-2 py-1 rounded-full bg-primary/10 text-primary capitalize">{x.role}</span></div>)}
  </div>);
}

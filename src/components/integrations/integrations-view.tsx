'use client';
import { useState } from 'react';
import { Puzzle, Check, X } from 'lucide-react';
const LI = [{id:'slack',name:'Slack'},{id:'discord',name:'Discord'},{id:'notion',name:'Notion'},{id:'google-drive',name:'Google Drive'},{id:'github',name:'GitHub'},{id:'gmail',name:'Gmail'},{id:'shopify',name:'Shopify'},{id:'zapier',name:'Zapier'}];
export function IntegrationsView() {
  const [connected, setConnected] = useState(['github']);
  const toggle = (id:string) => setConnected(p => p.includes(id) ? p.filter(x=>x!==id) : [...p,id]);
  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-bold">Integrations</h1><p className="text-muted-foreground">Connectez vos services</p></div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {LI.map(i => (
          <div key={i.id} className="bg-card rounded-xl border p-5 hover:shadow-md">
            <div className="flex items-start justify-between mb-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center"><Puzzle className="h-5 w-5 text-primary" /></div>
              {connected.includes(i.id) ? <Check className="h-5 w-5 text-green-500" /> : <X className="h-5 w-5 text-muted-foreground" />}
            </div>
            <h3 className="font-semibold">{i.name}</h3>
            <button onClick={() => toggle(i.id)} className={`w-full mt-3 py-1.5 rounded-lg text-sm font-medium ${connected.includes(i.id) ? 'bg-destructive/10 text-destructive' : 'bg-primary/10 text-primary'}`}>{connected.includes(i.id) ? 'Deconnecter' : 'Connecter'}</button>
          </div>
        ))}
      </div>
    </div>
  );
}

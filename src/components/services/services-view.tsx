'use client';
import { useState } from 'react';
import { Server, Play, Square, RefreshCw } from 'lucide-react';
const S = [{id:'redis',name:'Redis',status:'running',port:6379},{id:'bullmq',name:'BullMQ',status:'running'},{id:'pg',name:'PostgreSQL',status:'running',port:5432},{id:'agent',name:'Agent Engine',status:'stopped',port:4000}];
export function ServicesView() {
  const [svc] = useState(S);
  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-bold">Services</h1><p className="text-muted-foreground">Etat des services</p></div>
      <div className="space-y-2">
        {svc.map(s => (
          <div key={s.id} className="bg-card rounded-xl border p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Server className="h-5 w-5 text-primary" />
              <div><h3 className="font-semibold text-sm">{s.name}</h3>{s.port && <p className="text-xs text-muted-foreground">Port {s.port}</p>}</div>
            </div>
            <div className="flex items-center gap-3">
              <span className={`flex items-center gap-1 text-xs ${s.status==='running'?'text-green-500':'text-muted-foreground'}`}><span className={`w-2 h-2 rounded-full ${s.status==='running'?'bg-green-500':'bg-muted'}`} />{s.status==='running'?'Actif':'Arrete'}</span>
              <button className="p-1.5 rounded-lg hover:bg-accent">{s.status==='running'?<Square className="h-4 w-4" />:<Play className="h-4 w-4" />}</button>
              <button className="p-1.5 rounded-lg hover:bg-accent"><RefreshCw className="h-4 w-4" /></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

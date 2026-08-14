'use client';
import { useEffect, useState } from 'react';
import { Radio, Loader2, Play, Square } from 'lucide-react';
export function MultimodalView() {
  const [sessions, setSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const t = localStorage.getItem('genova_token');
    fetch('/api/multimodal', { headers: { Authorization: `Bearer ${t}` } }).then(r => r.json()).then(d => setSessions(Array.isArray(d) ? d : [])).catch(() => {}).finally(() => setLoading(false));
  }, []);
  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-bold">Multimodal</h1><p className="text-muted-foreground">Sessions multimodales (audio, video, texte)</p></div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-card rounded-xl border border-border p-6 text-center cursor-pointer hover:shadow-md transition-all">
          <Radio className="h-10 w-10 mx-auto text-blue-500 mb-3" />
          <h3 className="font-semibold">Audio</h3>
          <p className="text-xs text-muted-foreground">Stream audio en direct</p>
        </div>
        <div className="bg-card rounded-xl border border-border p-6 text-center cursor-pointer hover:shadow-md transition-all">
          <Play className="h-10 w-10 mx-auto text-green-500 mb-3" />
          <h3 className="font-semibold">Video</h3>
          <p className="text-xs text-muted-foreground">Stream video en direct</p>
        </div>
        <div className="bg-card rounded-xl border border-border p-6 text-center cursor-pointer hover:shadow-md transition-all">
          <Radio className="h-10 w-10 mx-auto text-purple-500 mb-3" />
          <h3 className="font-semibold">Mixte</h3>
          <p className="text-xs text-muted-foreground">Audio + Video + Texte</p>
        </div>
      </div>
      {sessions.length > 0 && (
        <div className="space-y-2">
          <h2 className="font-semibold">Sessions recentes</h2>
          {sessions.map((s: any) => (
            <div key={s.id} className="bg-card rounded-lg border p-3 flex justify-between text-sm">
              <span>{s.type}</span>
              <span className={`${s.status === 'active' ? 'text-green-500' : 'text-muted-foreground'}`}>{s.status}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

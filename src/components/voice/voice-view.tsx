'use client';
import { useEffect, useState } from 'react';
import { Mic, Loader2, Phone } from 'lucide-react';
export function VoiceView() {
  const [sessions, setSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const t = localStorage.getItem('genova_token');
    fetch('/api/voice', { headers: { Authorization: `Bearer ${t}` } }).then(r => r.json()).then(d => setSessions(Array.isArray(d) ? d : [])).catch(() => {}).finally(() => setLoading(false));
  }, []);
  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-bold">Voice</h1><p className="text-muted-foreground">Sessions vocales</p></div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-card rounded-xl border border-border p-6 text-center cursor-pointer hover:shadow-md">
          <Mic className="h-10 w-10 mx-auto text-primary mb-3" />
          <h3 className="font-semibold">Transcription</h3>
          <p className="text-sm text-muted-foreground">Parole vers texte</p>
        </div>
        <div className="bg-card rounded-xl border border-border p-6 text-center cursor-pointer hover:shadow-md">
          <Phone className="h-10 w-10 mx-auto text-primary mb-3" />
          <h3 className="font-semibold">Synthese</h3>
          <p className="text-sm text-muted-foreground">Texte vers parole</p>
        </div>
      </div>
      {sessions.map((s: any) => (
        <div key={s.id} className="bg-card rounded-lg border border-border p-3 flex justify-between text-sm">
          <span>{s.type}</span>
          <span className={`${s.status === 'active' ? 'text-green-500' : 'text-muted-foreground'}`}>{s.status}</span>
        </div>
      ))}
    </div>
  );
}

'use client';
import { useState } from 'react';
import { Star, Send, MessageSquare } from 'lucide-react';
export function FeedbackView() {
  const [r, setR] = useState(0);
  const [c, setC] = useState('');
  const [s, setS] = useState(false);
  const submit = async () => {
    if (!c.trim()||r===0) return;
    const t = localStorage.getItem('genova_token');
    await fetch('/api/feedback',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${t}`},body:JSON.stringify({rating:r,comment:c})});
    setS(true);
  };
  if (s) return <div className="text-center py-16"><MessageSquare className="h-12 w-12 mx-auto mb-4" /><h3>Merci!</h3></div>;
  return (<div className="space-y-6">
    <div><h1 className="text-2xl font-bold">Feedback</h1></div>
    <div className="bg-card rounded-xl border p-6 max-w-lg space-y-4">
      <div><label className="block text-sm font-medium mb-2">Note</label><div className="flex gap-1">{[1,2,3,4,5].map(n=><button key={n} onClick={()=>setR(n)} className={`p-2 ${n<=r?'text-yellow-500':'text-muted'}`}><Star className="h-6 w-6" fill={n<=r?'currentColor':'none'} /></button>)}</div></div>
      <div><label className="block text-sm font-medium mb-1">Commentaire</label><textarea value={c} onChange={e=>setC(e.target.value)} className="w-full px-3 py-2 rounded-lg border bg-background text-sm min-h-[100px]" placeholder="Votre experience..." /></div>
      <button onClick={submit} disabled={!c.trim()||r===0} className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm disabled:opacity-50"><Send className="h-4 w-4" />Envoyer</button>
    </div>
  </div>);
}

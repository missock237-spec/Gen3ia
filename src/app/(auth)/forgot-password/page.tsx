'use client';
import { useState } from 'react';
import { Sparkles, Mail, ArrowLeft, Loader2 } from 'lucide-react';
import Link from 'next/link';
export default function ForgotPwd() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [ld, setLd] = useState(false);
  const [err, setErr] = useState('');
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(''); setLd(true);
    try { const r = await fetch('/api/auth/forgot-password', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({email}) }); if (r.ok) setSent(true); else { const d = await r.json(); setErr(d.error||'Erreur'); } }
    catch { setErr('Erreur'); } finally { setLd(false); }
  };
  if (sent) return <div className="min-h-screen flex items-center justify-center"><div className="text-center"><Mail className="h-12 w-12 mx-auto mb-4" /><h1>Email envoye</h1><Link href="/login" className="text-primary text-sm">Retour</Link></div></div>;
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-primary/5 p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8"><div className="inline-flex gap-2 text-2xl font-bold mb-2"><Sparkles className="h-6 w-6 text-primary" /><span>Genova</span></div><p className="text-muted-foreground">Mot de passe oublie</p></div>
        <div className="bg-card rounded-xl border p-6 shadow-lg">
          <form onSubmit={submit} className="space-y-4">
            {err && <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm">{err}</div>}
            <p className="text-sm text-muted-foreground">Entrez votre email.</p>
            <div className="relative"><Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" /><input type="email" value={email} onChange={e=>setEmail(e.target.value)} className="w-full pl-9 pr-4 py-2 rounded-lg border bg-background text-sm" placeholder="email@exemple.com" required /></div>
            <button type="submit" disabled={ld} className="w-full py-2 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-50 flex items-center justify-center gap-2">{ld && <Loader2 className="h-4 w-4 animate-spin" />}Envoyer</button>
          </form>
          <div className="mt-4 text-center"><Link href="/login" className="inline-flex gap-1 text-sm text-primary"><ArrowLeft className="h-3 w-3" />Retour</Link></div>
        </div>
      </div>
    </div>
  );
}

'use client';
import { useState } from 'react';
import { UserCircle, Plus, Loader2 } from 'lucide-react';
export function AvatarsView() {
  const [avatars, setAvatars] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState('');
  const [style, setStyle] = useState('realistic');
  const [showAdd, setShowAdd] = useState(false);
  const addAvatar = async () => {
    if (!name.trim()) return;
    const t = localStorage.getItem('genova_token');
    const u = JSON.parse(localStorage.getItem('genova_user') || '{}')?.id;
    await fetch('/api/avatars', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` }, body: JSON.stringify({ name, style, userId: u }) });
    setName(''); setShowAdd(false);
  };
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold">Avatars</h1><p className="text-muted-foreground">Avatars virtuels pour vos agents</p></div>
        <button onClick={() => setShowAdd(true)} className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm"><Plus className="h-4 w-4" /> Creer</button>
      </div>
      {showAdd && (
        <div className="bg-card rounded-xl border border-border p-4 space-y-3">
          <input type="text" placeholder="Nom de l'avatar" value={name} onChange={e => setName(e.target.value)} className="w-full px-3 py-2 rounded-lg border bg-background text-sm" />
          <select value={style} onChange={e => setStyle(e.target.value)} className="w-full px-3 py-2 rounded-lg border bg-background text-sm">
            <option value="realistic">Realiste</option>
            <option value="cartoon">Dessin anime</option>
            <option value="pixel">Pixel art</option>
          </select>
          <div className="flex gap-2"><button onClick={addAvatar} className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm">Creer</button><button onClick={() => setShowAdd(false)} className="px-4 py-2 border rounded-lg text-sm">Annuler</button></div>
        </div>
      )}
      <div className="text-center py-16 bg-card rounded-xl border border-border">
        <UserCircle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
        <h3 className="text-lg font-medium mb-2">Aucun avatar</h3>
        <p className="text-sm text-muted-foreground">Creez votre premier avatar virtuel</p>
      </div>
    </div>
  );
}

'use client';
import { useState, useEffect, useCallback } from 'react';
import { UserCircle, Plus, Loader2, AlertCircle } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { useAuthStore } from '@/lib/store';

interface AvatarItem {
  id: string;
  name: string;
  style?: string;
  imageUrl?: string;
  createdAt?: string;
  [key: string]: unknown;
}

export function AvatarsView() {
  const [avatars, setAvatars] = useState<AvatarItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const [style, setStyle] = useState('realistic');
  const [showAdd, setShowAdd] = useState(false);
  const [creating, setCreating] = useState(false);

  const fetchAvatars = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const res = await apiFetch<{ avatars?: AvatarItem[]; data?: AvatarItem[] }>('/api/avatars');
      const list = res?.avatars || res?.data || [];
      setAvatars(Array.isArray(list) ? list : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de chargement');
      setAvatars([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAvatars();
  }, [fetchAvatars]);

  const addAvatar = async () => {
    if (!name.trim()) return;
    setCreating(true);
    try {
      const userId = useAuthStore.getState().user?.id;
      await apiFetch('/api/avatars', {
        method: 'POST',
        body: JSON.stringify({ name, style, userId }),
      });
      setName('');
      setShowAdd(false);
      await fetchAvatars();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de creation');
    } finally {
      setCreating(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div><h1 className="text-2xl font-bold">Avatars</h1><p className="text-muted-foreground">Avatars virtuels pour vos agents</p></div>
        </div>
        <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold">Avatars</h1><p className="text-muted-foreground">Avatars virtuels pour vos agents</p></div>
        <button onClick={() => setShowAdd(true)} className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm"><Plus className="h-4 w-4" /> Creer</button>
      </div>

      {error && <div className="bg-destructive/10 text-destructive text-sm rounded-lg p-3">{error}</div>}

      {showAdd && (
        <div className="bg-card rounded-xl border border-border p-4 space-y-3">
          <input type="text" placeholder="Nom de l'avatar" value={name} onChange={e => setName(e.target.value)} className="w-full px-3 py-2 rounded-lg border bg-background text-sm" />
          <select value={style} onChange={e => setStyle(e.target.value)} className="w-full px-3 py-2 rounded-lg border bg-background text-sm">
            <option value="realistic">Realiste</option>
            <option value="cartoon">Dessin anime</option>
            <option value="pixel">Pixel art</option>
          </select>
          <div className="flex gap-2">
            <button onClick={addAvatar} disabled={creating} className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm disabled:opacity-50">{creating ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Creer'}</button>
            <button onClick={() => setShowAdd(false)} className="px-4 py-2 border rounded-lg text-sm">Annuler</button>
          </div>
        </div>
      )}

      {avatars.length === 0 ? (
        <div className="text-center py-16 bg-card rounded-xl border border-border">
          <UserCircle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">Aucun avatar</h3>
          <p className="text-sm text-muted-foreground">Creez votre premier avatar virtuel</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {avatars.map(a => (
            <div key={a.id} className="bg-card rounded-xl border p-4 hover:shadow-md">
              <div className="flex items-center gap-3">
                {a.imageUrl ? (
                  <img src={a.imageUrl} alt={a.name} className="w-12 h-12 rounded-lg object-cover" />
                ) : (
                  <UserCircle className="h-12 w-12 text-muted-foreground" />
                )}
                <div>
                  <h3 className="font-semibold text-sm">{a.name}</h3>
                  <span className="text-xs text-muted-foreground">{a.style || 'realistic'}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

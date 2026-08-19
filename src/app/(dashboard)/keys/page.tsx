'use client';

import { useState } from 'react';

export default function KeysPage() {
  const [keys, setKeys] = useState<{ id: string; name: string; key: string; scopes: string; lastUsed: string | null }[]>([]);
  const [showNew, setShowNew] = useState(false);
  const [name, setName] = useState('');
  const [scope, setScope] = useState('read');
  const [newKey, setNewKey] = useState<string | null>(null);

  const createKey = async () => {
    const res = await fetch('/api/keys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + localStorage.getItem('accessToken') },
      body: JSON.stringify({ name, scopes: scope }),
    });
    if (res.ok) {
      const data = await res.json();
      setNewKey(data.key);
      setKeys([...keys, data]);
      setShowNew(false);
      setName('');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">🔑 Clés API</h1>
        <button onClick={() => setShowNew(true)} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition">
          + Créer une clé
        </button>
      </div>

      {newKey && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4">
          <p className="text-amber-400 font-medium text-sm mb-2">⚠️ Clé créée ! Copiez-la maintenant, elle ne sera plus jamais affichée.</p>
          <div className="flex gap-2">
            <code className="bg-gray-900 px-3 py-2 rounded text-sm text-white flex-1 break-all">{newKey}</code>
            <button onClick={() => { navigator.clipboard.writeText(newKey); }} className="bg-gray-700 hover:bg-gray-600 px-3 py-2 rounded text-sm text-white">Copier</button>
          </div>
        </div>
      )}

      {keys.length === 0 ? (
        <div className="text-center py-12 bg-gray-800/30 border border-gray-700/50 rounded-xl">
          <span className="text-4xl">🔑</span>
          <h3 className="text-white font-medium mt-3">Aucune clé API</h3>
          <p className="text-gray-400 text-sm mt-1">Créez une clé pour utiliser l&apos;API Gen3ia</p>
        </div>
      ) : (
        <div className="space-y-3">
          {keys.map(k => (
            <div key={k.id} className="bg-gray-800/50 border border-gray-700/50 rounded-xl p-4 flex items-center justify-between">
              <div>
                <p className="text-white font-medium">{k.name}</p>
                <p className="text-xs text-gray-500 mt-1">Portée: {k.scopes} · Dernière utilisation: {k.lastUsed || 'Jamais'}</p>
              </div>
              <div className="flex gap-2">
                <span className="bg-gray-700 text-gray-300 text-xs px-2 py-1 rounded">{k.key.slice(0, 20)}...</span>
                <button className="text-red-400 hover:text-red-300 text-sm">Révoquer</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showNew && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setShowNew(false)}>
          <div className="bg-gray-800 rounded-xl p-6 w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-semibold text-white mb-4">Nouvelle clé API</h2>
            <input
              placeholder="Nom de la clé"
              value={name} onChange={e => setName(e.target.value)}
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm mb-3 focus:outline-none focus:border-blue-500"
            />
            <select
              value={scope} onChange={e => setScope(e.target.value)}
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm mb-4 focus:outline-none focus:border-blue-500"
            >
              <option value="read">Lecture seule</option>
              <option value="write">Lecture et écriture</option>
              <option value="admin">Administrateur</option>
            </select>
            <div className="flex gap-2">
              <button onClick={() => setShowNew(false)} className="flex-1 bg-gray-700 hover:bg-gray-600 text-white py-2 rounded-lg text-sm">Annuler</button>
              <button onClick={createKey} disabled={!name} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-lg text-sm disabled:opacity-50">Créer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

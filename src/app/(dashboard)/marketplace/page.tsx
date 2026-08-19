'use client';

import { useEffect, useState } from 'react';

type Listing = {
  id: string; name: string; description: string;
  category: string; price: number; rating: number;
  downloads: number; type: string; status: string;
};

export default function MarketplacePage() {
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');

  useEffect(() => {
    fetch('/api/marketplace/agents?limit=50')
      .then(r => r.json().catch(() => ({ data: [] })))
      .then(d => setListings(d.data || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const categories = ['all', 'general', 'support', 'productivity', 'development', 'education', 'health', 'finance'];
  const filtered = listings.filter(l => {
    if (category !== 'all' && l.category !== category) return false;
    if (search && !l.name.toLowerCase().includes(search.toLowerCase()) && !l.description.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-white">🏪 Marketplace</h1>
        <button className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition">
          + Publier un agent
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        <input
          type="text"
          placeholder="Rechercher des agents..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white text-sm w-full md:w-80 focus:outline-none focus:border-blue-500"
        />
        <select
          value={category}
          onChange={e => setCategory(e.target.value)}
          className="bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
        >
          {categories.map(c => (
            <option key={c} value={c}>{c === 'all' ? 'Toutes catégories' : c}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1,2,3,4,5,6].map(i => <div key={i} className="h-48 bg-gray-800/50 rounded-xl animate-pulse" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 bg-gray-800/30 border border-gray-700/50 rounded-xl">
          <span className="text-5xl">🏪</span>
          <h3 className="text-white font-medium mt-4 text-lg">Aucun agent trouvé</h3>
          <p className="text-gray-400 mt-1">Essayez de modifier vos filtres</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((item) => (
            <div key={item.id} className="bg-gray-800/50 border border-gray-700/50 rounded-xl p-5 hover:border-blue-500/30 transition group">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="text-white font-medium group-hover:text-blue-400 transition">{item.name}</h3>
                  <span className="text-xs text-gray-500 uppercase">{item.type} · {item.category}</span>
                </div>
                {item.price > 0 ? (
                  <span className="text-blue-400 font-semibold text-sm">{item.price} crédits</span>
                ) : (
                  <span className="text-green-400 text-sm font-medium">Gratuit</span>
                )}
              </div>
              <p className="text-sm text-gray-400 line-clamp-2 mb-4">{item.description}</p>
              <div className="flex items-center justify-between text-xs text-gray-500">
                <span>{'⭐'.repeat(Math.round(item.rating || 0))} {item.rating?.toFixed(1) || 'N/A'}</span>
                <span>{item.downloads} téléchargements</span>
              </div>
              <button className="mt-4 w-full bg-gray-700 hover:bg-gray-600 text-white py-2 rounded-lg text-sm transition">
                Installer
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

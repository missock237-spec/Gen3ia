'use client';

import { useEffect, useState } from 'react';
import { Store, Loader2, Download, Star, Search } from 'lucide-react';

interface Listing {
  id: string; name: string; description: string; type: string; price: number;
  rating: number; downloads: number; user: { name: string };
  _count: { purchases: number };
}

export function MarketplaceView() {
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    const token = localStorage.getItem('genova_token');
    fetch('/api/marketplace', { headers: { 'Authorization': `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => setListings(Array.isArray(d) ? d : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = listings.filter(l => l.name.toLowerCase().includes(search.toLowerCase()));

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Marketplace</h1>
        <p className="text-muted-foreground">Découvrez des agents et templates</p>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input type="text" placeholder="Rechercher..." value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16 bg-card rounded-xl border border-border">
          <Store className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">Aucun résultat</h3>
          <p className="text-sm text-muted-foreground">Aucun listing disponible pour le moment</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((listing) => (
            <div key={listing.id} className="bg-card rounded-xl border border-border p-5 hover:shadow-md transition-all">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Store className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold truncate">{listing.name}</h3>
                  <p className="text-xs text-muted-foreground">{listing.type}</p>
                </div>
              </div>
              <p className="text-sm text-muted-foreground line-clamp-2 mb-3">{listing.description}</p>
              <div className="flex items-center justify-between pt-3 border-t border-border">
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1"><Star className="h-3 w-3 text-yellow-500" />{listing.rating.toFixed(1)}</span>
                  <span className="flex items-center gap-1"><Download className="h-3 w-3" />{listing._count.purchases}</span>
                </div>
                <span className="font-semibold text-sm">{listing.price === 0 ? 'Gratuit' : `${listing.price}$`}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

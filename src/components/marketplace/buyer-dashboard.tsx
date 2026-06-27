'use client';

import React, { useState, useEffect } from 'react';
import { Package, Download, RefreshCw, ExternalLink, Calendar, CheckCircle2, ChevronRight, ShoppingBag } from 'lucide-react';

interface Purchase {
  id: string;
  listingId: string;
  price: number;
  currency: string;
  status: string;
  createdAt: string;
  listing: {
    name: string;
    type: string;
    previewUrl?: string;
  };
}

export function BuyerDashboard() {
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPurchases();
  }, []);

  const fetchPurchases = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/marketplace/purchases');
      const json = await res.json();
      setPurchases(json.purchases || []);
    } catch (err) {
      console.error('Failed to load purchases');
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div className="p-8 text-center text-slate-400">Chargement de vos achats...</div>;

  if (purchases.length === 0) {
    return (
      <div className="p-12 text-center bg-slate-900/50 border border-slate-800 rounded-2xl">
        <ShoppingBag className="w-12 h-12 text-slate-700 mx-auto mb-4" />
        <h2 className="text-xl font-semibold mb-2">Aucun achat trouvé</h2>
        <p className="text-slate-400 mb-6">Vous n'avez pas encore acheté d'agents sur la Marketplace.</p>
        <button
          onClick={() => window.location.href = '/marketplace'}
          className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-medium transition-colors"
        >
          Parcourir la Marketplace
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-bold">Mes Achats</h2>
          <p className="text-sm text-slate-400">Gérez vos agents et ressources acquis</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {purchases.map((purchase) => (
          <div key={purchase.id} className="bg-slate-900/50 border border-slate-800 rounded-xl p-5 hover:border-slate-700 transition-all flex gap-4">
            <div className="w-16 h-16 bg-slate-800 rounded-lg flex items-center justify-center shrink-0">
              {purchase.listing.previewUrl ? (
                <img src={purchase.listing.previewUrl} alt={purchase.listing.name} className="w-full h-full object-cover rounded-lg" />
              ) : (
                <Package className="w-8 h-8 text-slate-600" />
              )}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex justify-between items-start mb-1">
                <h3 className="font-bold truncate pr-2">{purchase.listing.name}</h3>
                <span className="text-[10px] uppercase tracking-wider bg-blue-500/10 text-blue-400 px-2 py-0.5 rounded border border-blue-500/20">
                  {purchase.listing.type}
                </span>
              </div>

              <div className="flex items-center gap-3 text-xs text-slate-500 mb-4">
                <span className="flex items-center gap-1">
                  <Calendar className="w-3 h-3" /> {new Date(purchase.createdAt).toLocaleDateString()}
                </span>
                <span className="flex items-center gap-1 text-emerald-400">
                  <CheckCircle2 className="w-3 h-3" /> Payé
                </span>
              </div>

              <div className="flex gap-2">
                <button className="flex-1 flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 py-2 rounded-lg text-xs font-medium transition-colors">
                  <Download className="w-3 h-3" /> Installer
                </button>
                <button className="flex-1 flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 py-2 rounded-lg text-xs font-medium transition-colors">
                  <RefreshCw className="w-3 h-3" /> Update
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

'use client';

import { useEffect, useState } from 'react';

type Plan = { id: string; name: string; price: number; credits: number; maxAgents: number | string; features: string[]; popular?: boolean };

export default function BillingPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/payments/plans')
      .then(r => r.json())
      .then(d => setPlans(d.data || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">Facturation</h1>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">{[1,2,3,4].map(i => <div key={i} className="h-64 bg-gray-800/50 rounded-xl animate-pulse" />)}</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {plans.map((plan) => (
            <div
              key={plan.id}
              className={`relative bg-gray-800/50 border rounded-xl p-6 ${
                plan.popular ? 'border-blue-500/50 ring-1 ring-blue-500/20' : 'border-gray-700/50'
              }`}
            >
              {plan.popular && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-blue-600 text-white text-xs font-semibold px-3 py-1 rounded-full">Populaire</span>
              )}

              <div className="text-center mb-4">
                <h3 className="text-lg font-semibold text-white">{plan.name}</h3>
                <div className="mt-2">
                  <span className="text-3xl font-bold text-white">
                    {plan.price === 0 ? 'Gratuit' : `${plan.price.toLocaleString()} FCFA`}
                  </span>
                  {plan.price > 0 && <span className="text-gray-400 text-sm">/mois</span>}
                </div>
                <p className="text-sm text-gray-400 mt-1">{plan.credits.toLocaleString()} crédits</p>
              </div>

              <ul className="space-y-2 mb-6">
                {plan.features.map((f, i) => (
                  <li key={i} className="flex items-center gap-2 text-sm text-gray-300">
                    <span className="text-green-400">✓</span> {f}
                  </li>
                ))}
              </ul>

              <button
                className={`w-full py-2.5 rounded-lg text-sm font-semibold transition ${
                  plan.popular
                    ? 'bg-blue-600 hover:bg-blue-700 text-white'
                    : 'bg-gray-700 hover:bg-gray-600 text-white'
                }`}
              >
                {plan.price === 0 ? 'Commencer' : `Choisir ${plan.name}`}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

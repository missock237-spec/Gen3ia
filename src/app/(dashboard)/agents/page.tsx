'use client';

import { useEffect, useState } from 'react';

export default function AgentsPage() {
  const [agents, setAgents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/agents')
      .then(r => r.json().catch(() => ({ agents: [] })))
      .then(d => setAgents(d.agents || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">🤖 Agents</h1>
        <button className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition">
          + Créer un agent
        </button>
      </div>

      {loading ? (
        <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-20 bg-gray-800/50 rounded-xl animate-pulse" />)}</div>
      ) : agents.length === 0 ? (
        <div className="text-center py-12 bg-gray-800/30 border border-gray-700/50 rounded-xl">
          <span className="text-4xl">🤖</span>
          <h3 className="text-white font-medium mt-3">Aucun agent pour le moment</h3>
          <p className="text-gray-400 text-sm mt-1">Créez votre premier agent IA pour commencer</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {agents.map((a: any) => (
            <div key={a.id} className="bg-gray-800/50 border border-gray-700/50 rounded-xl p-5 hover:border-blue-500/30 transition">
              <div className="flex items-center justify-between mb-3">
                <span className="text-lg font-medium text-white">{a.name}</span>
                <span className={`text-xs px-2 py-1 rounded-full ${a.status === 'active' ? 'bg-green-500/20 text-green-400' : 'bg-gray-600/20 text-gray-400'}`}>
                  {a.status}
                </span>
              </div>
              {a.description && <p className="text-sm text-gray-400 mb-3 line-clamp-2">{a.description}</p>}
              <div className="flex items-center gap-3 text-xs text-gray-500">
                <span>Type: {a.type}</span>
                {a._count?.memories !== undefined && <span>Mémoires: {a._count.memories}</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
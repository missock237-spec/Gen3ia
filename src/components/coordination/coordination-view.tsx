'use client';

import { useState } from 'react';
import { GitBranch, Plus, Play, Settings, Users } from 'lucide-react';

interface Workflow {
  id: string;
  name: string;
  description: string;
  status: string;
  stepCount: number;
  updatedAt: string;
}

const mockWorkflows: Workflow[] = [
  {
    id: '1',
    name: 'Support client automatisé',
    description: 'Coordonne les agents de support pour une réponse rapide',
    status: 'active',
    stepCount: 5,
    updatedAt: new Date().toISOString(),
  },
  {
    id: '2',
    name: 'Pipeline marketing',
    description: 'Orchestre les agents marketing pour les campagnes',
    status: 'draft',
    stepCount: 3,
    updatedAt: new Date().toISOString(),
  },
];

export function CoordinationView() {
  const [workflows] = useState<Workflow[]>(mockWorkflows);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Coordination</h1>
          <p className="text-muted-foreground">Workflows multi-agents</p>
        </div>
        <button className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors text-sm font-medium">
          <Plus className="h-4 w-4" />
          Nouveau workflow
        </button>
      </div>

      {workflows.length === 0 ? (
        <div className="text-center py-16 bg-card rounded-xl border border-border">
          <GitBranch className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">Aucun workflow</h3>
          <p className="text-sm text-muted-foreground">Créez votre premier workflow multi-agents</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {workflows.map((wf) => (
            <div
              key={wf.id}
              className="bg-card rounded-xl border border-border p-5 hover:shadow-md transition-all"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <GitBranch className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold">{wf.name}</h3>
                    <p className="text-xs text-muted-foreground">{wf.stepCount} étapes</p>
                  </div>
                </div>
                <span
                  className={`text-xs px-2 py-1 rounded-full ${
                    wf.status === 'active'
                      ? 'bg-green-500/10 text-green-500'
                      : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {wf.status === 'active' ? 'Actif' : 'Brouillon'}
                </span>
              </div>
              <p className="text-sm text-muted-foreground line-clamp-2 mb-4">{wf.description}</p>
              <div className="flex items-center gap-2 pt-3 border-t border-border">
                <button className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-sm hover:bg-primary/20 transition-colors">
                  <Play className="h-3 w-3" />
                  Exécuter
                </button>
                <button className="p-1.5 rounded-lg hover:bg-accent text-muted-foreground">
                  <Settings className="h-4 w-4" />
                </button>
                <button className="p-1.5 rounded-lg hover:bg-accent text-muted-foreground">
                  <Users className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

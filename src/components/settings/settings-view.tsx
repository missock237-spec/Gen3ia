'use client';

import { useState } from 'react';
import { Settings, User, Shield, Bell, CreditCard, Key, Check } from 'lucide-react';

interface SettingsViewProps {
  initialTab?: string;
}

type TabId = 'profile' | 'security' | 'notifications' | 'billing' | 'api-keys' | 'approvals';

const tabs: { id: TabId; label: string; icon: React.ElementType }[] = [
  { id: 'profile', label: 'Profil', icon: User },
  { id: 'security', label: 'Sécurité', icon: Shield },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'billing', label: 'Facturation', icon: CreditCard },
  { id: 'api-keys', label: 'Clés API', icon: Key },
  { id: 'approvals', label: 'Approbations', icon: Check },
];

export function SettingsView({ initialTab = 'profile' }: SettingsViewProps) {
  const [activeTab, setActiveTab] = useState<TabId>(initialTab as TabId);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Paramètres</h1>
        <p className="text-muted-foreground">Gérez votre compte et vos préférences</p>
      </div>

      <div className="flex gap-2 border-b border-border pb-1 overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 text-sm rounded-t-lg transition-colors whitespace-nowrap ${
              activeTab === tab.id
                ? 'bg-card border border-border border-b-background text-foreground font-medium -mb-px'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <tab.icon className="h-4 w-4" />
            {tab.label}
          </button>
        ))}
      </div>

      <div className="bg-card rounded-xl border border-border p-6">
        {activeTab === 'profile' && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold">Informations du profil</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Nom</label>
                <input type="text" className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm" placeholder="Votre nom" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Email</label>
                <input type="email" className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm" placeholder="email@exemple.com" />
              </div>
            </div>
            <button className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors">
              Enregistrer
            </button>
          </div>
        )}

        {activeTab === 'approvals' && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold">Approbations en attente</h2>
            <p className="text-sm text-muted-foreground">
              Aucune approbation en attente pour le moment.
            </p>
          </div>
        )}

        {activeTab !== 'profile' && activeTab !== 'approvals' && (
          <div className="text-center py-12">
            <Settings className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">{tabs.find(t => t.id === activeTab)?.label}</h3>
            <p className="text-sm text-muted-foreground">
              Configuration en cours de développement
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

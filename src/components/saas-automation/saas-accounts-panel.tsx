'use client';

// ============================================================
// SaaS Accounts Manager — Composant UI principal
// Gestion des comptes SaaS liés, exécution d'actions, templates
// ============================================================

import { useState, useEffect, useCallback } from 'react';

// Types
interface SaaSAccount {
  id: string;
  provider: string;
  label: string;
  authType: string;
  accountEmail?: string;
  accountName?: string;
  avatarUrl?: string;
  isActive: boolean;
  lastVerifiedAt?: string;
  tokenExpiresAt?: string;
  scopes: string[];
  createdAt: string;
}

interface ActionTemplate {
  name: string;
  description: string;
  provider: string;
  operation: string;
  category: string;
  actionType: string;
  riskLevel: string;
  requiredScopes: string[];
}

interface AutonomousAction {
  id: string;
  operation: string;
  provider: string;
  status: string;
  riskLevel: string;
  executionTimeMs?: number;
  createdAt: string;
  completedAt?: string;
  errorMessage?: string;
}

// Provider icons et couleurs
const PROVIDER_CONFIG: Record<string, { icon: string; color: string; label: string }> = {
  google_gmail: { icon: '📧', color: '#EA4335', label: 'Gmail' },
  google_calendar: { icon: '📅', color: '#4285F4', label: 'Google Calendar' },
  google_drive: { icon: '📁', color: '#FBBC04', label: 'Google Drive' },
  slack: { icon: '💬', color: '#4A154B', label: 'Slack' },
  notion: { icon: '📓', color: '#000000', label: 'Notion' },
  github: { icon: '🐙', color: '#181717', label: 'GitHub' },
  salesforce: { icon: '☁️', color: '#00A1E0', label: 'Salesforce' },
  hubspot: { icon: '🟠', color: '#FF7A59', label: 'HubSpot' },
  jira: { icon: '🎯', color: '#0052CC', label: 'Jira' },
  linkedin: { icon: '💼', color: '#0A66C2', label: 'LinkedIn' },
  microsoft: { icon: '🔵', color: '#00A4EF', label: 'Microsoft' },
  twitter: { icon: '🐦', color: '#1DA1F2', label: 'Twitter/X' },
  stripe: { icon: '💳', color: '#635BFF', label: 'Stripe' },
  shopify: { icon: '🛒', color: '#00BF63', label: 'Shopify' },
};

const RISK_COLORS: Record<string, string> = {
  low: '#22c55e',
  medium: '#f59e0b',
  high: '#ef4444',
  critical: '#dc2626',
};

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending: { label: 'En attente', color: '#f59e0b' },
  consent_requested: { label: 'Consentement requis', color: '#8b5cf6' },
  approved: { label: 'Approuvé', color: '#3b82f6' },
  executing: { label: 'En cours', color: '#06b6d4' },
  completed: { label: 'Terminé', color: '#22c55e' },
  failed: { label: 'Échoué', color: '#ef4444' },
  cancelled: { label: 'Annulé', color: '#6b7280' },
};

export default function SaaSAutomationPanel() {
  const [accounts, setAccounts] = useState<SaaSAccount[]>([]);
  const [templates, setTemplates] = useState<Record<string, ActionTemplate[]>>({});
  const [actionHistory, setActionHistory] = useState<AutonomousAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'accounts' | 'templates' | 'actions'>('accounts');
  const [executing, setExecuting] = useState<string | null>(null);

  // Charger les données
  const fetchAccounts = useCallback(async () => {
    try {
      const res = await fetch('/api/saas-accounts');
      const data = await res.json();
      setAccounts(data.accounts || []);
    } catch (err) {
      console.error('Erreur chargement comptes:', err);
    }
  }, []);

  const fetchTemplates = useCallback(async () => {
    try {
      const res = await fetch('/api/action-templates?groupBy=provider');
      const data = await res.json();
      setTemplates(data.templates || {});
    } catch (err) {
      console.error('Erreur chargement templates:', err);
    }
  }, []);

  const fetchActions = useCallback(async () => {
    try {
      const res = await fetch('/api/autonomous-actions?limit=20');
      const data = await res.json();
      setActionHistory(data.actions || []);
    } catch (err) {
      console.error('Erreur chargement actions:', err);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await Promise.all([fetchAccounts(), fetchTemplates(), fetchActions()]);
      } catch {}
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [fetchAccounts, fetchTemplates, fetchActions]);

  // Lier un compte via OAuth
  const handleLinkAccount = async (provider: string) => {
    try {
      const res = await fetch('/api/saas-accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          initiateOAuth: true,
          provider,
          label: PROVIDER_CONFIG[provider]?.label || provider,
          redirectUri: `${window.location.origin}/api/saas-accounts/callback`,
        }),
      });
      const data = await res.json();
      if (data.authorizationUrl) {
        window.open(data.authorizationUrl, '_blank', 'width=600,height=700');
      }
    } catch (err) {
      console.error('Erreur liaison compte:', err);
    }
  };

  // Délier un compte
  const handleUnlinkAccount = async (accountId: string) => {
    if (!confirm('Supprimer ce compte SaaS lié ? Les agents ne pourront plus y accéder.')) return;
    try {
      await fetch(`/api/saas-accounts?accountId=${accountId}`, { method: 'DELETE' });
      fetchAccounts();
    } catch (err) {
      console.error('Erreur suppression:', err);
    }
  };

  // Exécuter une action via template
  const handleExecuteTemplate = async (template: ActionTemplate, account: SaaSAccount) => {
    setExecuting(template.operation);
    try {
      const res = await fetch('/api/autonomous-actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          saasAccountId: account.id,
          operation: template.operation,
          inputParams: {},
          executionMode: 'supervised',
        }),
      });
      const data = await res.json();
      if (data.status === 'consent_required') {
        alert('Consentement requis — vérifiez vos notifications.');
      } else if (data.status === 'completed') {
        alert('Action exécutée avec succès !');
      }
      fetchActions();
    } catch (err) {
      console.error('Erreur exécution:', err);
    } finally {
      setExecuting(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        <span className="ml-3 text-gray-500">Chargement...</span>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Automatisation SaaS</h1>
          <p className="text-gray-500 mt-1">Gérez vos comptes externes et permettez aux agents IA d&apos;agir en votre nom</p>
        </div>
        <button
          onClick={() => {
            const provider = prompt('Provider (google_gmail, slack, notion, github, etc.):');
            if (provider) handleLinkAccount(provider);
          }}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          + Lier un compte
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200">
        {(['accounts', 'templates', 'actions'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab === 'accounts' ? `Comptes liés (${accounts.length})` : tab === 'templates' ? 'Templates d\'actions' : 'Historique'}
          </button>
        ))}
      </div>

      {/* Tab: Comptes liés */}
      {activeTab === 'accounts' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {accounts.length === 0 ? (
            <div className="col-span-full text-center py-12 text-gray-400">
              Aucun compte SaaS lié. Cliquez sur &quot;Lier un compte&quot; pour commencer.
            </div>
          ) : (
            accounts.map(account => {
              const config = PROVIDER_CONFIG[account.provider] || { icon: '🔗', color: '#6b7280', label: account.provider };
              return (
                <div key={account.id} className="border rounded-xl p-4 hover:shadow-md transition-shadow">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{config.icon}</span>
                      <div>
                        <h3 className="font-semibold text-gray-900">{account.label}</h3>
                        <p className="text-xs text-gray-500">{config.label}</p>
                        {account.accountEmail && (
                          <p className="text-xs text-gray-400 mt-0.5">{account.accountEmail}</p>
                        )}
                      </div>
                    </div>
                    <span className={`w-2 h-2 rounded-full ${account.isActive ? 'bg-green-500' : 'bg-gray-300'}`} />
                  </div>

                  <div className="mt-3 flex flex-wrap gap-1">
                    {account.scopes.slice(0, 3).map(scope => (
                      <span key={scope} className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded">
                        {scope.split('.').pop()}
                      </span>
                    ))}
                    {account.scopes.length > 3 && (
                      <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-400 rounded">
                        +{account.scopes.length - 3}
                      </span>
                    )}
                  </div>

                  <div className="mt-3 flex justify-between items-center">
                    <span className="text-xs text-gray-400">
                      {account.authType === 'oauth2' ? 'OAuth 2.0' : account.authType}
                    </span>
                    <button
                      onClick={() => handleUnlinkAccount(account.id)}
                      className="text-xs text-red-500 hover:text-red-700"
                    >
                      Délier
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Tab: Templates d'actions */}
      {activeTab === 'templates' && (
        <div className="space-y-6">
          {Object.entries(templates).map(([provider, tmplts]) => {
            const config = PROVIDER_CONFIG[provider] || { icon: '🔗', label: provider };
            const linkedAccount = accounts.find(a => a.provider === provider);
            return (
              <div key={provider}>
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-xl">{config.icon}</span>
                  <h3 className="font-semibold text-gray-900">{config.label}</h3>
                  {linkedAccount ? (
                    <span className="text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded">Connecté</span>
                  ) : (
                    <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-500 rounded">Non connecté</span>
                  )}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {tmplts.map(template => (
                    <div key={template.operation} className="border rounded-lg p-3 flex items-center justify-between">
                      <div className="flex-1">
                        <h4 className="text-sm font-medium text-gray-800">{template.name}</h4>
                        <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{template.description}</p>
                        <span
                          className="text-xs font-medium mt-1 inline-block"
                          style={{ color: RISK_COLORS[template.riskLevel] }}
                        >
                          {template.riskLevel}
                        </span>
                      </div>
                      {linkedAccount ? (
                        <button
                          onClick={() => handleExecuteTemplate(template, linkedAccount)}
                          disabled={executing === template.operation}
                          className="ml-2 px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                        >
                          {executing === template.operation ? '...' : 'Exécuter'}
                        </button>
                      ) : (
                        <span className="text-xs text-gray-400 ml-2">Non connecté</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Tab: Historique */}
      {activeTab === 'actions' && (
        <div className="space-y-2">
          {actionHistory.length === 0 ? (
            <div className="text-center py-12 text-gray-400">Aucune action exécutée pour le moment.</div>
          ) : (
            actionHistory.map(action => {
              const status = STATUS_LABELS[action.status] || { label: action.status, color: '#6b7280' };
              return (
                <div key={action.id} className="border rounded-lg p-3 flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-800">{action.operation}</span>
                      <span className="text-xs px-2 py-0.5 rounded" style={{ backgroundColor: status.color + '20', color: status.color }}>
                        {status.label}
                      </span>
                      <span className="text-xs font-medium" style={{ color: RISK_COLORS[action.riskLevel] }}>
                        {action.riskLevel}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                      <span>{action.provider}</span>
                      {action.executionTimeMs && <span>{action.executionTimeMs}ms</span>}
                      <span>{new Date(action.createdAt).toLocaleString()}</span>
                    </div>
                    {action.errorMessage && (
                      <p className="text-xs text-red-500 mt-1">{action.errorMessage}</p>
                    )}
                  </div>
                  {action.status === 'consent_requested' && (
                    <button
                      onClick={async () => {
                        await fetch('/api/autonomous-actions', {
                          method: 'PATCH',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ action: 'approve', actionId: action.id }),
                        });
                        fetchActions();
                      }}
                      className="ml-2 px-3 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700"
                    >
                      Approuver
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

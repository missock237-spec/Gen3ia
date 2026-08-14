'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  PermissionScope,
  RiskLevel,
  ScopeDefinition,
  AgentPermissionGrant,
  AuditEntry,
  SCOPE_DEFINITIONS,
} from '@/lib/agent-permissions';
import { Shield, ShieldAlert, ShieldCheck, AlertTriangle, Key, Trash2, RefreshCw, X, Plus, Info, Lock } from 'lucide-react';

interface PermissionManagerProps {
  userId: string;
}

// Helper generic function in .tsx using <T,> format
const formatList = <T,>(items: T[], formatter: (item: T) => string): string => {
  return items.map(formatter).join(', ');
};

export function PermissionManager({ userId }: PermissionManagerProps) {
  const [grants, setGrants] = useState<AgentPermissionGrant[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshingAudit, setRefreshingAudit] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [selectedAgentId, setSelectedAgentId] = useState<string>('');
  const [selectedScopes, setSelectedScopes] = useState<PermissionScope[]>([]);
  const [maxCreditsPerDay, setMaxCreditsPerDay] = useState<string>('');
  const [rateLimitPerMinute, setRateLimitPerMinute] = useState<string>('');
  const [allowedDomains, setAllowedDomains] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);

  // Fetch Grants
  const fetchGrants = useCallback(async () => {
    try {
      setError(null);
      const res = await fetch(`/api/agent-permissions?userId=${encodeURIComponent(userId)}`);
      if (!res.ok) {
        throw new Error('Failed to fetch permission grants');
      }
      const data = await res.json();
      if (data.success && Array.isArray(data.grants)) {
        setGrants(data.grants);
      }
    } catch (err: any) {
      setError(err?.message || 'Error loading grants');
    }
  }, [userId]);

  // Fetch Audit Logs
  const fetchAuditLogs = useCallback(async () => {
    try {
      setRefreshingAudit(true);
      const res = await fetch(`/api/agent-permissions/audit?userId=${encodeURIComponent(userId)}&limit=50`);
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.auditLog)) {
          setAuditLogs(data.auditLog);
        }
      }
    } catch (err: any) {
      console.error('Failed to fetch audit log', err);
    } finally {
      setRefreshingAudit(false);
    }
  }, [userId]);

  useEffect(() => {
    const loadInitialData = async () => {
      setLoading(true);
      await Promise.all([fetchGrants(), fetchAuditLogs()]);
      setLoading(false);
    };
    loadInitialData();
  }, [fetchGrants, fetchAuditLogs]);

  // Revoke Permissions
  const handleRevoke = async (agentId: string) => {
    if (!confirm(`Are you sure you want to revoke permissions for agent '${agentId}'?`)) {
      return;
    }
    try {
      setError(null);
      const res = await fetch(
        `/api/agent-permissions?agentId=${encodeURIComponent(agentId)}&userId=${encodeURIComponent(userId)}`,
        { method: 'DELETE' }
      );
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to revoke permissions');
      }
      await fetchGrants();
      await fetchAuditLogs();
    } catch (err: any) {
      setError(err?.message || 'Error revoking permissions');
    }
  };

  // Open Modal for new or existing agent
  const openGrantModal = (agentId: string = '', existingScopes: PermissionScope[] = []) => {
    setSelectedAgentId(agentId);
    setSelectedScopes(existingScopes);
    setMaxCreditsPerDay('');
    setRateLimitPerMinute('');
    setAllowedDomains('');
    setIsModalOpen(true);
  };

  // Toggle scope selection
  const toggleScope = (scope: PermissionScope) => {
    setSelectedScopes((prev) =>
      prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope]
    );
  };

  // Handle Grant Submit
  const handleGrantSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAgentId.trim()) {
      setError('Please enter an Agent ID');
      return;
    }

    try {
      setSubmitting(true);
      setError(null);

      const parsedMaxCredits = maxCreditsPerDay ? parseInt(maxCreditsPerDay, 10) : undefined;
      const parsedRateLimit = rateLimitPerMinute ? parseInt(rateLimitPerMinute, 10) : undefined;
      const parsedDomains = allowedDomains
        ? allowedDomains
            .split(',')
            .map((d) => d.trim())
            .filter((d) => d.length > 0)
        : undefined;

      const res = await fetch('/api/agent-permissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentId: selectedAgentId.trim(),
          userId,
          scopes: selectedScopes,
          conditions: {
            maxCreditsPerDay: parsedMaxCredits,
            rateLimitPerMinute: parsedRateLimit,
            allowedDomains: parsedDomains,
          },
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to grant permissions');
      }

      setIsModalOpen(false);
      await fetchGrants();
      await fetchAuditLogs();
    } catch (err: any) {
      setError(err?.message || 'Error granting permissions');
    } finally {
      setSubmitting(false);
    }
  };

  // Helper for Risk Level Badge
  const getRiskBadge = (riskLevel: RiskLevel) => {
    switch (riskLevel) {
      case RiskLevel.LOW:
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
            LOW
          </span>
        );
      case RiskLevel.MEDIUM:
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-amber-500/10 text-amber-600 border border-amber-500/20">
            MEDIUM
          </span>
        );
      case RiskLevel.HIGH:
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-orange-500/10 text-orange-600 border border-orange-500/20">
            HIGH
          </span>
        );
      case RiskLevel.CRITICAL:
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-red-500/10 text-red-600 border border-red-500/20">
            CRITICAL
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-secondary text-muted-foreground border">
            UNKNOWN
          </span>
        );
    }
  };

  // Risk Summary calculation for selected scopes in modal
  const getRiskSummary = () => {
    const summary: Record<RiskLevel, number> = {
      [RiskLevel.LOW]: 0,
      [RiskLevel.MEDIUM]: 0,
      [RiskLevel.HIGH]: 0,
      [RiskLevel.CRITICAL]: 0,
    };
    selectedScopes.forEach((scope) => {
      const def = SCOPE_DEFINITIONS[scope];
      if (def) {
        summary[def.riskLevel] = (summary[def.riskLevel] || 0) + 1;
      }
    });
    return summary;
  };

  const riskSummary = getRiskSummary();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-6 bg-card border rounded-lg shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <Shield className="h-6 w-6 text-primary" />
            <h2 className="text-xl font-bold text-foreground">Agent Permissions & Sandboxing</h2>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Manage granular API permission scopes, rate limits, and security conditions for marketplace agents.
          </p>
        </div>
        <button
          onClick={() => openGrantModal('', [])}
          className="inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 rounded-md transition-colors"
        >
          <Plus className="h-4 w-4" /> Grant Agent Permissions
        </button>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="p-4 bg-destructive/10 border border-destructive/20 text-destructive rounded-lg flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            <span className="text-sm font-medium">{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-destructive hover:opacity-80">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Installed Agents & Granted Scopes */}
      <div className="bg-card border rounded-lg p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Key className="h-5 w-5 text-primary" />
            <h3 className="text-lg font-semibold">Active Agent Grants</h3>
          </div>
          <button
            onClick={fetchGrants}
            className="p-2 text-muted-foreground hover:text-foreground bg-secondary rounded-md transition-colors"
            title="Refresh grants"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>

        {loading ? (
          <div className="py-8 text-center text-muted-foreground text-sm">Loading active permissions...</div>
        ) : grants.length === 0 ? (
          <div className="py-8 text-center border border-dashed rounded-md p-6 space-y-2">
            <ShieldCheck className="h-8 w-8 text-muted-foreground mx-auto" />
            <p className="text-sm text-muted-foreground">No active agent permission grants found for your account.</p>
            <button
              onClick={() => openGrantModal('', [])}
              className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-accent text-accent-foreground rounded-md hover:bg-accent/80 transition-colors"
            >
              <Plus className="h-3.5 w-3.5" /> Grant Scopes
            </button>
          </div>
        ) : (
          <div className="grid gap-4">
            {grants.map((grant) => (
              <div key={grant.id} className="border rounded-md p-4 bg-background space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b pb-3">
                  <div>
                    <span className="font-semibold text-foreground">{grant.agentId}</span>
                    <span className="text-xs text-muted-foreground ml-2">
                      Granted: {new Date(grant.grantedAt).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => openGrantModal(grant.agentId, grant.scopes)}
                      className="px-3 py-1 text-xs font-medium bg-secondary text-secondary-foreground hover:bg-secondary/80 rounded transition-colors"
                    >
                      Review / Edit
                    </button>
                    <button
                      onClick={() => handleRevoke(grant.agentId)}
                      className="inline-flex items-center gap-1 px-3 py-1 text-xs font-medium bg-destructive text-destructive-foreground hover:bg-destructive/90 rounded transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Revoke
                    </button>
                  </div>
                </div>

                {/* Scope badges */}
                <div className="space-y-1.5">
                  <span className="text-xs font-medium text-muted-foreground block">Granted Scopes:</span>
                  {grant.scopes.length === 0 ? (
                    <span className="text-xs italic text-muted-foreground">No scopes granted</span>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {grant.scopes.map((scope) => {
                        const def = SCOPE_DEFINITIONS[scope];
                        return (
                          <div
                            key={scope}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs border bg-card"
                            title={def?.description}
                          >
                            <span className="font-mono text-foreground">{scope}</span>
                            {def && getRiskBadge(def.riskLevel)}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Grant Conditions */}
                {(grant.conditions.maxCreditsPerDay ||
                  grant.conditions.rateLimitPerMinute ||
                  (grant.conditions.allowedDomains && grant.conditions.allowedDomains.length > 0)) && (
                  <div className="pt-2 text-xs text-muted-foreground border-t flex flex-wrap gap-4">
                    {grant.conditions.maxCreditsPerDay && (
                      <span>
                        <strong>Daily Credits:</strong> {grant.conditions.maxCreditsPerDay}
                      </span>
                    )}
                    {grant.conditions.rateLimitPerMinute && (
                      <span>
                        <strong>Rate Limit:</strong> {grant.conditions.rateLimitPerMinute} req/min
                      </span>
                    )}
                    {grant.conditions.allowedDomains && grant.conditions.allowedDomains.length > 0 && (
                      <span>
                        <strong>Domains:</strong> {formatList(grant.conditions.allowedDomains, (d) => d)}
                      </span>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Audit Logs Section */}
      <div className="bg-card border rounded-lg p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Lock className="h-5 w-5 text-primary" />
            <h3 className="text-lg font-semibold">Sandbox Execution Audit Log</h3>
          </div>
          <button
            onClick={fetchAuditLogs}
            disabled={refreshingAudit}
            className="p-2 text-muted-foreground hover:text-foreground bg-secondary rounded-md transition-colors"
            title="Refresh Audit Log"
          >
            <RefreshCw className={`h-4 w-4 ${refreshingAudit ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {auditLogs.length === 0 ? (
          <div className="py-6 text-center text-sm text-muted-foreground border border-dashed rounded-md">
            No audit log entries recorded yet.
          </div>
        ) : (
          <div className="overflow-x-auto border rounded-md">
            <table className="w-full text-sm text-left">
              <thead className="bg-secondary text-xs uppercase text-muted-foreground border-b">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Timestamp</th>
                  <th className="px-4 py-2.5 font-medium">Agent</th>
                  <th className="px-4 py-2.5 font-medium">Action</th>
                  <th className="px-4 py-2.5 font-medium">Scope</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-background">
                {auditLogs.map((log) => {
                  const def = SCOPE_DEFINITIONS[log.scope];
                  return (
                    <tr key={log.id} className="hover:bg-accent/50 transition-colors">
                      <td className="px-4 py-2.5 whitespace-nowrap text-xs text-muted-foreground">
                        {new Date(log.timestamp).toLocaleString()}
                      </td>
                      <td className="px-4 py-2.5 font-medium text-foreground">{log.agentId}</td>
                      <td className="px-4 py-2.5 text-xs text-muted-foreground">{log.action}</td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-xs">{log.scope}</span>
                          {def && getRiskBadge(def.riskLevel)}
                        </div>
                      </td>
                      <td className="px-4 py-2.5">
                        {log.allowed ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                            <ShieldCheck className="h-3 w-3" /> Allowed
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-red-500/10 text-red-600 border border-red-500/20">
                            <ShieldAlert className="h-3 w-3" /> Denied
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Grant / Scope Definition Review Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-card border rounded-lg shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col my-8">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 border-b">
              <div className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-primary" />
                <h3 className="text-lg font-bold">Configure Agent Permission Scopes</h3>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1 rounded text-muted-foreground hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleGrantSubmit} className="p-6 space-y-6 overflow-y-auto flex-1">
              {/* Agent ID Input */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Agent ID</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. agent-market-analyst"
                  value={selectedAgentId}
                  onChange={(e) => setSelectedAgentId(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-background border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              {/* Risk Summary Badge Bar */}
              <div className="p-3 bg-secondary rounded-md space-y-2">
                <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
                  <span>Selected Scopes Risk Summary:</span>
                  <span>{selectedScopes.length} Scopes Selected</span>
                </div>
                <div className="flex gap-3">
                  <div className="flex items-center gap-1 text-xs">
                    <span className="text-emerald-600 font-bold">{riskSummary[RiskLevel.LOW]}</span> Low
                  </div>
                  <div className="flex items-center gap-1 text-xs">
                    <span className="text-amber-600 font-bold">{riskSummary[RiskLevel.MEDIUM]}</span> Medium
                  </div>
                  <div className="flex items-center gap-1 text-xs">
                    <span className="text-orange-600 font-bold">{riskSummary[RiskLevel.HIGH]}</span> High
                  </div>
                  <div className="flex items-center gap-1 text-xs">
                    <span className="text-red-600 font-bold">{riskSummary[RiskLevel.CRITICAL]}</span> Critical
                  </div>
                </div>
              </div>

              {/* Scope Definitions Checklist */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground block">Available Permission Scopes</label>
                <div className="grid gap-2 max-h-60 overflow-y-auto border rounded-md p-3 bg-background">
                  {(Object.values(SCOPE_DEFINITIONS) as ScopeDefinition[]).map((def) => {
                    const isChecked = selectedScopes.includes(def.scope);
                    return (
                      <label
                        key={def.scope}
                        className={`flex items-start gap-3 p-2.5 rounded-md border cursor-pointer transition-colors ${
                          isChecked ? 'bg-accent/40 border-primary/40' : 'hover:bg-secondary/50 border-border'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleScope(def.scope)}
                          className="mt-1 rounded border-border text-primary focus:ring-primary"
                        />
                        <div className="flex-1 space-y-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-mono text-xs font-semibold text-foreground">{def.scope}</span>
                            <div className="flex items-center gap-1.5">
                              {def.requiresApproval && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 border border-amber-500/20 font-medium">
                                  Requires Approval
                                </span>
                              )}
                              {getRiskBadge(def.riskLevel)}
                            </div>
                          </div>
                          <p className="text-xs text-muted-foreground">{def.description}</p>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Sandbox Execution Conditions */}
              <div className="space-y-3 pt-2 border-t">
                <div className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                  <Info className="h-4 w-4 text-primary" /> Sandbox Execution Conditions (Optional)
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground block mb-1">
                      Max Credits Per Day
                    </label>
                    <input
                      type="number"
                      min="1"
                      placeholder="e.g. 500"
                      value={maxCreditsPerDay}
                      onChange={(e) => setMaxCreditsPerDay(e.target.value)}
                      className="w-full px-3 py-1.5 text-sm bg-background border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground block mb-1">
                      Rate Limit (Requests / Min)
                    </label>
                    <input
                      type="number"
                      min="1"
                      placeholder="e.g. 60"
                      value={rateLimitPerMinute}
                      onChange={(e) => setRateLimitPerMinute(e.target.value)}
                      className="w-full px-3 py-1.5 text-sm bg-background border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1">
                    Allowed External Domains (Comma Separated)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. api.github.com, openai.com"
                    value={allowedDomains}
                    onChange={(e) => setAllowedDomains(e.target.value)}
                    className="w-full px-3 py-1.5 text-sm bg-background border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
              </div>

              {/* Modal Actions */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-sm font-medium bg-secondary text-secondary-foreground hover:bg-secondary/80 rounded-md transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 rounded-md transition-colors disabled:opacity-50"
                >
                  {submitting ? 'Granting...' : 'Approve & Grant Scopes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

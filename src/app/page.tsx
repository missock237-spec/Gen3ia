'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuthStore, useAppStore } from '@/lib/store';
import { AppSidebar } from '@/components/layout/app-sidebar';
import { AppHeader } from '@/components/layout/app-header';
import { DashboardView } from '@/components/dashboard/dashboard-view';
import { AgentsView } from '@/components/agents/agents-view';
import { AutomationView } from '@/components/automation/automation-view';
import { GuardrailsView } from '@/components/guardrails/guardrails-view';
import { CoordinationView } from '@/components/coordination/coordination-view';
import { SettingsView } from '@/components/settings/settings-view';
import { AnalyticsView } from '@/components/analytics/analytics-view';
import BillingPage from './(dashboard)/billing/page';
import DevelopersPage from './(dashboard)/developers/page';
import { ThemeProvider } from 'next-themes';
import { Loader2, AlertTriangle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import HardTechLanding from '@/components/landing/hardtech-landing';

function AppContent() {
  // Sélecteurs zustand INDIVIDUELS (retournent des références stables)
  // → évite les re-rendus infinis dus à un objet déstructuré recréé à chaque rendu.
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isLoading = useAuthStore((s) => s.isLoading);
  const hydrate = useAuthStore((s) => s.hydrate);
  const validateSession = useAuthStore((s) => s.validateSession);
  const logout = useAuthStore((s) => s.logout);

  const currentView = useAppStore((s) => s.currentView);
  const fetchApprovalCount = useAppStore((s) => s.fetchApprovalCount);

  const hydratedRef = useRef(false);
  const validatedRef = useRef(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // --- Fix 2 : logs debug pour hydrate() ---
  // Trace l'exécution et les erreurs de hydrate() côté navigateur.
  useEffect(() => {
    if (!hydratedRef.current) {
      hydratedRef.current = true;
      hydrate()
        .then(() => {
          console.log('[gen3ia] hydrate OK');
        })
        .catch((err: Error) => {
          console.error('[gen3ia] hydrate error:', err);
          setLoadError(err?.message || 'Erreur de chargement');
        });
    }
  }, [hydrate]);

  // --- Fix 2 : logs debug pour validateSession() ---
  // Trace les erreurs de validateSession() côté navigateur.
  useEffect(() => {
    if (isAuthenticated && !validatedRef.current && !loadError) {
      validatedRef.current = true;
      validateSession()
        .then((valid) => {
          if (valid) {
            console.log('[gen3ia] validateSession OK — session active');
            fetchApprovalCount().catch((err) => {
              console.warn('[gen3ia] fetchApprovalCount failed:', err);
            });
          } else {
            console.warn('[gen3ia] validateSession : session expirée');
            setLoadError('Session expirée, veuillez vous reconnecter');
          }
        })
        .catch((err) => {
          console.error('[gen3ia] validateSession error:', err);
          setLoadError('Session expirée, veuillez vous reconnecter');
        });
    }
  }, [isAuthenticated, loadError, validateSession, fetchApprovalCount]);

  // --- Fix 4 : logout est stable (zustand), callback stable aussi ---
  const handleUnauthorized = useCallback(() => {
    validatedRef.current = false;
    void logout();
  }, [logout]);

  useEffect(() => {
    window.addEventListener('auth:unauthorized', handleUnauthorized);
    return () => window.removeEventListener('auth:unauthorized', handleUnauthorized);
  }, [handleUnauthorized]);

  if (loadError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Alert variant="destructive" className="max-w-md">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{loadError}</AlertDescription>
        </Alert>
      </div>
    );
  }

  // Landing publique Hard-Tech Realism pour les visiteurs non authentifiés
  if (!isAuthenticated && !isLoading) {
    return <HardTechLanding />;
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">
          {isLoading ? 'Chargement de Gen3ia...' : 'Redirection vers la connexion...'}
        </p>
      </div>
    );
  }

  const renderView = () => {
    switch (currentView) {
      case 'dashboard': return <DashboardView />;
      case 'agents': return <AgentsView />;
      case 'automation': return <AutomationView />;
      case 'guardrails': return <GuardrailsView />;
      case 'coordination': return <CoordinationView />;
      case 'settings': return <SettingsView />;
      case 'approvals': return <SettingsView initialTab="approvals" />;
      case 'analytics': return <AnalyticsView />;
      case 'billing': return <BillingPage />;
      case 'developers': return <DevelopersPage />;
      default: return <DashboardView />;
    }
  };

  return (
    <div className="min-h-screen flex bg-background">
      <AppSidebar />
      <main className="flex-1 flex flex-col min-w-0">
        <AppHeader />
        <div className="flex-1 p-4 sm:p-6 overflow-auto">
          {renderView()}
        </div>
      </main>
    </div>
  );
}

export default function Home() {
  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
      <AppContent />
    </ThemeProvider>
  );
}

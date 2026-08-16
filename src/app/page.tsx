'use client';

import { useEffect, useRef, useState } from 'react';
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
  const { isAuthenticated, isLoading, hydrate, validateSession, logout } = useAuthStore();
  const { currentView, fetchApprovalCount } = useAppStore();
  const hydratedRef = useRef(false);
  const validatedRef = useRef(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!hydratedRef.current) {
      hydratedRef.current = true;
      hydrate().catch((err: Error) => {
        setLoadError(err.message || 'Erreur de chargement');
      });
    }
  }, [hydrate]);

  useEffect(() => {
    if (isAuthenticated && !validatedRef.current && !loadError) {
      validatedRef.current = true;
      validateSession().then(valid => {
        if (valid) fetchApprovalCount();
      }).catch(() => {
        setLoadError('Session expirée, veuillez vous reconnecter');
      });
    }
  }, [isAuthenticated, loadError, validateSession, fetchApprovalCount]);

  useEffect(() => {
    const handleUnauthorized = () => {
      validatedRef.current = false;
      logout();
    };
    window.addEventListener('auth:unauthorized', handleUnauthorized);
    return () => window.removeEventListener('auth:unauthorized', handleUnauthorized);
  }, [logout]);

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

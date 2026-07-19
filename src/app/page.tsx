'use client';

import { useEffect, useRef } from 'react';
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
import { ThemeProvider } from 'next-themes';
import { Loader2 } from 'lucide-react';

function AppContent() {
  const { isAuthenticated, isLoading, user } = useAuthStore();
  const { currentView } = useAppStore();
  const hydrateRef = useRef(false);
  const validatedRef = useRef(false);

  useEffect(() => {
    if (!hydrateRef.current) {
      hydrateRef.current = true;
      useAuthStore.getState().hydrate();
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated && !validatedRef.current) {
      validatedRef.current = true;
      (async () => {
        const valid = await useAuthStore.getState().validateSession();
        if (valid) {
          useAppStore.getState().fetchApprovalCount();
        }
      })();
    }
  }, [isAuthenticated]);

  useEffect(() => {
    const handleUnauthorized = () => {
      useAuthStore.getState().logout();
      validatedRef.current = false;
    };
    window.addEventListener('auth:unauthorized', handleUnauthorized);
    return () => window.removeEventListener('auth:unauthorized', handleUnauthorized);
  }, []);

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Chargement...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex bg-background">
      <AppSidebar />
      <main className="flex-1 flex flex-col min-w-0">
        <AppHeader />
        <div className="flex-1 p-4 sm:p-6 overflow-auto">
          {currentView === 'dashboard' && <DashboardView />}
          {currentView === 'agents' && <AgentsView />}
          {currentView === 'automation' && <AutomationView />}
          {currentView === 'guardrails' && <GuardrailsView />}
          {currentView === 'coordination' && <CoordinationView />}
          {currentView === 'settings' && <SettingsView />}
          {currentView === 'approvals' && <SettingsView initialTab="approvals" />}
          {currentView === 'analytics' && <AnalyticsView />}
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

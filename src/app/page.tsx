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
<<<<<<< HEAD
import IntegrationsView from '@/components/integrations/integrations-view';
import ConnectorsView from '@/components/connectors/connectors-view';
import { ThemeProvider } from 'next-themes';
<<<<<<< HEAD
import { Loader2 } from 'lucide-react';
import { GenovaLogo } from '@/components/ui/genova-logo';
=======
import { motion, AnimatePresence } from 'framer-motion';

const viewComponents = {
  dashboard: DashboardView,
  agents: AgentsView,
  automation: AutomationView,
  guardrails: GuardrailsView,
  coordination: CoordinationView,
};
>>>>>>> 393da2d (34435f28-a1d4-4c91-9d7c-40c579ff6a46)

function AppContent() {
  const { isAuthenticated, isLoading, user } = useAuthStore();
  const { currentView } = useAppStore();
  const hydrateRef = useRef(false);
=======
import { ThemeProvider } from 'next-themes';
import { Loader2 } from 'lucide-react';

function AppContent() {
  const { isAuthenticated, user } = useAuthStore();
  const { currentView } = useAppStore();
  const hydrateRef = useRef(false);
  const validateRef = useRef(false);
>>>>>>> 2f7c5f3 (5433aca4-1e96-4e29-8166-a30aceccff4d)
  const validatedRef = useRef(false);

  // Hydrate auth from localStorage only once on mount
  useEffect(() => {
    if (!hydrateRef.current) {
      hydrateRef.current = true;
      useAuthStore.getState().hydrate();
<<<<<<< HEAD

      // Immediately validate the session with the server
      (async () => {
        const valid = await useAuthStore.getState().validateSession();
        if (valid) {
          useAppStore.getState().fetchApprovalCount();
        }
        validatedRef.current = true;
      })();
    }
  }, []);

  // Listen for storage events (cross-tab logout)
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'genova_user' && !e.newValue) {
        useAuthStore.setState({ user: null, isAuthenticated: false, isLoading: false });
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  // If not authenticated and not loading, redirect to login page
  useEffect(() => {
    if (!isLoading && !isAuthenticated && validatedRef.current) {
      window.location.href = '/login';
    }
  }, [isLoading, isAuthenticated]);

  // Show loading spinner while validating session or redirecting
  if (isLoading || !isAuthenticated || !validatedRef.current) {
    return (
      <div className="min-h-screen flex items-center justify-center gradient-bg grid-pattern">
        <div className="flex flex-col items-center gap-4">
          <GenovaLogo size="md" showText={true} />
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Chargement...</p>
        </div>
      </div>
    );
  }

  // Check if email not verified — redirect to login with error
  if (isAuthenticated && user && user.isEmailVerified === false) {
    if (typeof window !== 'undefined') {
      window.location.href = '/login?error=email_not_verified';
    }
    return null;
=======
    }
  }, []);

  // Validate session once when authenticated
  useEffect(() => {
    if (isAuthenticated && !validateRef.current) {
      validateRef.current = true;
      (async () => {
        const valid = await useAuthStore.getState().validateSession();
        if (valid) {
          useAppStore.getState().fetchApprovalCount();
        }
        validatedRef.current = true;
      })();
    }
  }, [isAuthenticated]);

  // Listen for auth:unauthorized events
  useEffect(() => {
    const handleUnauthorized = () => {
      useAuthStore.getState().logout();
      validateRef.current = false;
      validatedRef.current = false;
    };
    window.addEventListener('auth:unauthorized', handleUnauthorized);
    return () => window.removeEventListener('auth:unauthorized', handleUnauthorized);
  }, []);

  if (!isAuthenticated) {
    return <AuthForm />;
>>>>>>> 2f7c5f3 (5433aca4-1e96-4e29-8166-a30aceccff4d)
  }

  return (
    <div className="min-h-screen flex bg-background grid-pattern">
      <AppSidebar />
      <main className="flex-1 flex flex-col min-w-0">
        <AppHeader />
        <div className="flex-1 p-4 sm:p-6 overflow-auto">
<<<<<<< HEAD
<<<<<<< HEAD
=======
>>>>>>> 2f7c5f3 (5433aca4-1e96-4e29-8166-a30aceccff4d)
          {currentView === 'dashboard' && <DashboardView />}
          {currentView === 'agents' && <AgentsView />}
          {currentView === 'automation' && <AutomationView />}
          {currentView === 'guardrails' && <GuardrailsView />}
          {currentView === 'coordination' && <CoordinationView />}
          {currentView === 'settings' && <SettingsView />}
          {currentView === 'approvals' && <SettingsView initialTab="approvals" />}
          {currentView === 'analytics' && <AnalyticsView />}
<<<<<<< HEAD
          {currentView === 'integrations' && <IntegrationsView />}
          {currentView === 'connectors' && <ConnectorsView />}
=======
          <AnimatePresence mode="wait">
            <motion.div
              key={currentView}
              initial={{ opacity: 0, y: 20, filter: 'blur(4px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              exit={{ opacity: 0, y: -20, filter: 'blur(4px)' }}
              transition={{ duration: 0.3, ease: 'easeInOut' }}
            >
              <ViewComponent />
            </motion.div>
          </AnimatePresence>
>>>>>>> 393da2d (34435f28-a1d4-4c91-9d7c-40c579ff6a46)
=======
>>>>>>> 2f7c5f3 (5433aca4-1e96-4e29-8166-a30aceccff4d)
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

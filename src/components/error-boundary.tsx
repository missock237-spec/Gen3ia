'use client';

import React, { Component, createContext, useContext, useState, useCallback } from 'react';
import { AlertTriangle, RefreshCw, Home, Bug, X } from 'lucide-react';

type ErrorSeverity = 'low' | 'medium' | 'high' | 'critical';

interface ErrorInfo {
  message: string;
  severity: ErrorSeverity;
  timestamp: number;
  source?: string;
  error?: Error;
  dismissed?: boolean;
}

interface ErrorContextType {
  errors: ErrorInfo[];
  reportError: (message: string, severity?: ErrorSeverity, source?: string, error?: Error) => void;
  dismissError: (timestamp: number) => void;
  clearErrors: () => void;
  lastError: ErrorInfo | null;
}

const ErrorContext = createContext<ErrorContextType>({
  errors: [],
  reportError: () => {},
  dismissError: () => {},
  clearErrors: () => {},
  lastError: null,
});

export function useErrorHandler() {
  return useContext(ErrorContext);
}

// ============================================================
// ErrorBoundary — Capture les erreurs React non rattrapees
// ============================================================

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, errorInfo);
    this.props.onError?.(error, errorInfo);

    // Tentative d'envoi a Sentry si disponible
    try {
      const Sentry = require('@sentry/nextjs');
      Sentry.captureException?.(error, { extra: { componentStack: errorInfo.componentStack } });
    } catch {}
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      const isDev = process.env.NODE_ENV === 'development';

      return (
        <div className="flex min-h-[400px] items-center justify-center p-8">
          <div className="max-w-lg w-full rounded-xl border border-red-200 dark:border-red-900/50 bg-card p-8 text-center shadow-lg">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-100 dark:bg-red-950">
              <AlertTriangle className="h-8 w-8 text-red-600 dark:text-red-400" />
            </div>

            <h2 className="mb-2 text-xl font-semibold text-foreground">
              Une erreur est survenue
            </h2>
            <p className="mb-6 text-sm text-muted-foreground">
              Un composant de l&apos;interface a rencontre un probleme. Veuillez reessayer ou recharger la page.
            </p>

            {isDev && this.state.error && (
              <div className="mb-6 rounded-lg bg-red-50 dark:bg-red-950/50 p-4 text-left">
                <div className="flex items-center gap-2 mb-2">
                  <Bug className="h-4 w-4 text-red-500" />
                  <span className="text-xs font-semibold text-red-700 dark:text-red-400">
                    {this.state.error.name || 'Error'}
                  </span>
                </div>
                <pre className="text-xs text-red-600 dark:text-red-300 whitespace-pre-wrap break-all">
                  {this.state.error.message}
                </pre>
                {this.state.error.stack && (
                  <details className="mt-2">
                    <summary className="text-xs text-red-500 cursor-pointer hover:text-red-400">
                      Stack trace
                    </summary>
                    <pre className="mt-1 text-[10px] text-red-400 dark:text-red-500 whitespace-pre-wrap">
                      {this.state.error.stack}
                    </pre>
                  </details>
                )}
              </div>
            )}

            <div className="flex items-center justify-center gap-3">
              <button
                onClick={this.handleReset}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                <RefreshCw className="h-4 w-4" />
                Reessayer
              </button>
              <button
                onClick={this.handleReload}
                className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-accent transition-colors"
              >
                <Home className="h-4 w-4" />
                Recharger
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// ============================================================
// ErrorProvider — Contexte global pour les erreurs
// ============================================================

export function ErrorProvider({ children }: { children: React.ReactNode }) {
  const [errors, setErrors] = useState<ErrorInfo[]>([]);

  const reportError = useCallback((
    message: string,
    severity: ErrorSeverity = 'medium',
    source?: string,
    error?: Error
  ) => {
    const info: ErrorInfo = {
      message,
      severity,
      timestamp: Date.now(),
      source,
      error,
    };
    setErrors(prev => [info, ...prev].slice(0, 50));

    if (severity === 'critical' || severity === 'high') {
      console.error('[ErrorHandler]', message, error);
      try {
        const Sentry = require('@sentry/nextjs');
        Sentry.captureException?.(error || new Error(message), {
          level: severity === 'critical' ? 'fatal' : 'error',
          tags: { source },
        });
      } catch {}
    }
  }, []);

  const dismissError = useCallback((timestamp: number) => {
    setErrors(prev => prev.filter(e => e.timestamp !== timestamp));
  }, []);

  const clearErrors = useCallback(() => {
    setErrors([]);
  }, []);

  const lastError = errors.length > 0 ? errors[0] : null;

  return (
    <ErrorContext.Provider value={{ errors, reportError, dismissError, clearErrors, lastError }}>
      {children}

      {/* Toast d'erreur flottant */}
      {lastError && !lastError.dismissed && (
        <div className="fixed bottom-4 right-4 z-50 max-w-sm animate-in slide-in-from-right">
          <div className={`rounded-xl border p-4 shadow-2xl ${
            lastError.severity === 'critical' || lastError.severity === 'high'
              ? 'bg-red-950 border-red-800'
              : 'bg-yellow-950 border-yellow-800'
          }`}>
            <div className="flex items-start gap-3">
              <AlertTriangle className={`h-5 w-5 shrink-0 mt-0.5 ${
                lastError.severity === 'critical' || lastError.severity === 'high'
                  ? 'text-red-400' : 'text-yellow-400'
              }`} />
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-medium ${
                  lastError.severity === 'critical' || lastError.severity === 'high'
                    ? 'text-red-200' : 'text-yellow-200'
                }`}>
                  {lastError.message}
                </p>
                {lastError.source && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Source: {lastError.source}
                  </p>
                )}
              </div>
              <button
                onClick={() => dismissError(lastError.timestamp)}
                className="shrink-0 p-1 rounded hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </ErrorContext.Provider>
  );
}

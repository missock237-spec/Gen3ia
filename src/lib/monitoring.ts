import * as Sentry from '@sentry/nextjs';

const SENTRY_DSN = process.env.SENTRY_DSN || '';
const ENVIRONMENT = process.env.NODE_ENV || 'development';
const RELEASE = process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA || 'dev';

export function initSentry(): void {
  if (!SENTRY_DSN) {
    console.log('[Sentry] DSN non configuré - mode dégradé');
    return;
  }

  Sentry.init({
    dsn: SENTRY_DSN,
    environment: ENVIRONMENT,
    release: RELEASE,
    tracesSampleRate: ENVIRONMENT === 'production' ? 0.2 : 1.0,
    profilesSampleRate: ENVIRONMENT === 'production' ? 0.1 : 0.5,
    integrations: [
      new Sentry.BrowserTracing(),
      new Sentry.Replay({
        maskAllText: true,
        blockAllMedia: true,
      }),
    ],
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,
    beforeSend(event) {
      if (ENVIRONMENT === 'development') {
        console.log('[Sentry Event]', event.exception?.values?.[0]?.value);
        return null; // Ne pas envoyer en dev
      }
      return event;
    },
  });

  console.log(`[Sentry] Initialisé: ${ENVIRONMENT}`);
}

export function captureError(error: Error, context?: Record<string, unknown>): void {
  if (!SENTRY_DSN) {
    console.error('[Error]', error.message, context || '');
    return;
  }

  Sentry.withScope((scope) => {
    if (context) {
      scope.setExtras(context);
    }
    Sentry.captureException(error);
  });
}

export function captureMessage(message: string, level: 'info' | 'warning' | 'error' = 'info'): void {
  if (!SENTRY_DSN) {
    console.log(`[${level.toUpperCase()}]`, message);
    return;
  }

  Sentry.captureMessage(message, level);
}

export function setUserContext(userId: string, email: string, plan: string): void {
  if (!SENTRY_DSN) return;
  Sentry.setUser({ id: userId, email, plan });
}

export function clearUserContext(): void {
  if (!SENTRY_DSN) return;
  Sentry.setUser(null);
}

export function addBreadcrumb(message: string, category: string, data?: Record<string, unknown>): void {
  if (!SENTRY_DSN) {
    console.log(`[Breadcrumb:${category}]`, message);
    return;
  }

  Sentry.addBreadcrumb({
    message,
    category,
    data,
    level: 'info',
  });
}

export function getSentryDSN(): string {
  return SENTRY_DSN;
}

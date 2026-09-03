"use client";

import Link from "next/link";

/**
 * Boutons d'authentification OAuth (GitHub / Google).
 * Le clic redirige vers le fournisseur — l'utilisateur autorise, c'est tout.
 * Aucun jeton à saisir, aucune configuration utilisateur.
 */

function GitHubIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.55 0-.27-.01-1.17-.02-2.12-3.2.7-3.88-1.36-3.88-1.36-.52-1.33-1.28-1.68-1.28-1.68-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.19 1.76 1.19 1.03 1.75 2.69 1.25 3.34.95.1-.74.4-1.25.72-1.54-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.17 1.18a10.9 10.9 0 0 1 5.78 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.83 1.19 3.09 0 4.42-2.7 5.39-5.26 5.68.41.36.78 1.06.78 2.14 0 1.55-.01 2.79-.01 3.17 0 .31.21.67.8.55A11.51 11.51 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5Z" />
    </svg>
  );
}

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47a5.57 5.57 0 0 1-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82Z" />
      <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09A11.99 11.99 0 0 0 12 24Z" />
      <path fill="#FBBC05" d="M5.27 14.29A7.2 7.2 0 0 1 4.89 12c0-.8.14-1.57.38-2.29V6.62H1.29a11.99 11.99 0 0 0 0 10.76l3.98-3.09Z" />
      <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.7 0 3.99 2.47 1.29 6.62l3.98 3.09C6.22 6.86 8.87 4.75 12 4.75Z" />
    </svg>
  );
}

export function OAuthButtons({ redirectTo = "/dashboard" }: { redirectTo?: string }) {
  const qs = `?redirect=${encodeURIComponent(redirectTo)}`

  return (
    <div className="space-y-3">
      <div className="relative">
        <div className="absolute inset-0 flex items-center" aria-hidden="true">
          <span className="w-full border-t border-zinc-800" />
        </div>
        <div className="relative flex justify-center text-xs uppercase tracking-widest">
          <span className="bg-zinc-900/40 px-2 text-zinc-500">ou continuer avec</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <a
          href={`/api/auth/oauth/github${qs}`}
          className="flex h-11 items-center justify-center gap-2.5 rounded-xl border border-zinc-800 bg-zinc-900/60 text-sm font-medium text-zinc-100 transition-colors hover:border-zinc-600 hover:bg-zinc-800/60"
        >
          <GitHubIcon className="h-5 w-5" />
          GitHub
        </a>
        <a
          href={`/api/auth/oauth/google${qs}`}
          className="flex h-11 items-center justify-center gap-2.5 rounded-xl border border-zinc-800 bg-zinc-900/60 text-sm font-medium text-zinc-100 transition-colors hover:border-zinc-600 hover:bg-zinc-800/60"
        >
          <GoogleIcon className="h-5 w-5" />
          Google
        </a>
      </div>
    </div>
  );
}

/** Bandeau d'erreur OAuth (paramètre ?error=oauth_…) sur la page de connexion. */
export function OAuthErrorNotice({ error }: { error: string | null }) {
  if (!error) return null
  const readable = error
    .replace(/^oauth_github_/, "GitHub : ")
    .replace(/^oauth_google_/, "Google : ")
    .replace(/_/g, " ")
  return (
    <div className="mb-4 rounded-xl border border-red-900/60 bg-red-950/40 px-4 py-3 text-sm text-red-200">
      Connexion OAuth refusée — {readable}. Réessayez ou utilisez l&apos;e-mail.
    </div>
  );
}

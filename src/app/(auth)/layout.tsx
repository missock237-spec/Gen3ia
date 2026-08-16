/**
 * Gen3ia AI OS — Auth Layout
 * Fournit le fond sombre et le design cohérent pour toutes les pages d'auth.
 * La vérification de session est gérée côté client dans chaque formulaire.
 */

import type { ReactNode } from 'react';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/5 via-transparent to-transparent pointer-events-none" />
      {children}
    </div>
  );
}

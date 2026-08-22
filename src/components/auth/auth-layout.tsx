/**
 * GENOVA AI OS — Auth Layout
 * Shared layout component for all auth pages.
 * Animated background + Features panel + glassmorphism card.
 */

'use client';

import { type ReactNode } from 'react';
import { AnimatedBackground, FeaturesPanel } from './shared';
import { GenovaLogo } from '@/components/ui/genova-logo';

interface AuthLayoutProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
}

export function AuthLayout({ title, subtitle, children }: AuthLayoutProps) {
  return (
    <div className="min-h-screen bg-[#06080d] text-slate-100 flex">
      <AnimatedBackground />

      {/* Left: Features */}
      <div className="relative hidden lg:block lg:w-1/2 xl:w-3/5 border-r border-cyan-500/10">
        <FeaturesPanel />
      </div>

      {/* Right: Auth Form */}
      <div className="relative w-full lg:w-1/2 xl:w-2/5 flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-md">
          {/* Card — glassmorphism amélioré */}
          <div className="bg-slate-900/70 backdrop-blur-2xl border border-cyan-500/15 rounded-3xl p-8 shadow-2xl shadow-cyan-950/30 relative overflow-hidden">
            {/* Accent gradient top bar */}
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-cyan-500 via-blue-500 to-purple-600" />
            {/* Subtle glow */}
            <div className="absolute -top-24 -right-24 w-48 h-48 bg-cyan-500/5 rounded-full blur-3xl pointer-events-none" />

            {/* Logo + Brand */}
            <div className="mb-8 space-y-2">
              <div className="flex items-center gap-3 mb-4">
                <GenovaLogo size="sm" showText={true} compact={true} />
              </div>
              <h1 className="text-2xl font-bold text-white tracking-tight">{title}</h1>
              {subtitle && <p className="text-sm text-slate-400/80">{subtitle}</p>}
            </div>

            {/* Form area */}
            <div>{children}</div>

            {/* Footer */}
            <div className="mt-8 pt-5 border-t border-slate-800/30 text-center">
              <p className="text-xs text-slate-600">
                © {new Date().getFullYear()} Gen3ia AI. Tous droits réservés.{' '}
                <span className="text-slate-700">·</span>{' '}
                <a href="/privacy" className="text-cyan-500/60 hover:text-cyan-400 transition-colors">Confidentialité</a>
              </p>
              <p className="text-[10px] text-slate-700 mt-1.5 font-mono">v2026.8.22 — Firebase Auth + Firestore</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

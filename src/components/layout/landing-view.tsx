'use client';

import React from 'react';
import BackgroundScene from '@/components/ui/aurora-section-hero';
import { GenovaLogo } from '@/components/ui/genova-logo';
import { Button } from '@/components/ui/button';
import { LogIn, UserPlus, ArrowRight } from 'lucide-react';
import Link from 'next/link';

export function LandingView() {
  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-[#000500]">
      <BackgroundScene beamCount={60} />

      <div className="content-wrapper">
        <header className="main-header border-b border-white/5">
          <div className="landing-logo">
            <GenovaLogo size="sm" showText={true} compact={true} />
          </div>
          <nav className="landing-nav hidden md:flex">
            <a href="#features">Solutions</a>
            <a href="#platform">Platform</a>
            <a href="#company">Company</a>
            <Link href="/login" className="text-white/70 hover:text-[#00ff7f] transition-colors">Connexion</Link>
          </nav>
          <div className="flex items-center gap-3">
             <Link href="/login">
                <Button variant="ghost" className="text-white/70 hover:text-[#00ff7f] hover:bg-white/5">
                  <LogIn className="w-4 h-4 mr-2" />
                  Connexion
                </Button>
             </Link>
             <Link href="/register">
                <Button className="bg-[#00ff7f] text-black hover:bg-[#00cc66] font-bold">
                  <UserPlus className="w-4 h-4 mr-2" />
                  S'inscrire
                </Button>
             </Link>
          </div>
        </header>

        <main className="hero-section">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-[#00ff7f] text-xs font-medium mb-6 animate-pulse">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#00ff7f] opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-[#00ff7f]"></span>
            </span>
            Genova AI OS v2.0 est disponible
          </div>

          <h1 className="text-white">L'Avenir des Données et de l'IA</h1>
          <p>
            Libérez un potentiel inégalé et stimulez l'innovation avec notre plateforme
            d'intelligence artificielle de nouvelle génération.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 mt-4">
            <Link href="/register">
              <button className="cta-button">
                Essayer Gratuitement <ArrowRight className="w-4 h-4" />
              </button>
            </Link>
            <Link href="/login">
              <button className="secondary-button h-full py-4 px-8">
                Demander une Démo
              </button>
            </Link>
          </div>
        </main>

        <footer className="p-8 text-center text-white/20 text-xs border-t border-white/5">
          © {new Date().getFullYear()} Genova AI OS. Système d'Exploitation Intelligente.
        </footer>
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useUser, formatCredits } from "@/lib/client/hooks";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, LogOut, Menu, X, Coins, ShieldCheck } from "lucide-react";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Tableau de bord", icon: "gauge" },
  { href: "/agents", label: "Mes agents", icon: "bot" },
  { href: "/tasks", label: "Task Center", icon: "list-checks" },
  { href: "/knowledge", label: "Connaissances", icon: "book-open" },
  { href: "/skills", label: "Compétences", icon: "graduation-cap" },
  { href: "/tools", label: "Outils", icon: "wrench" },
  { href: "/connectors", label: "Connecteurs", icon: "plug-zap" },
  { href: "/memory", label: "Mémoire", icon: "database" },
  { href: "/marketplace", label: "Marketplace", icon: "store" },
  { href: "/api", label: "Clés API", icon: "key-round" },
  { href: "/sdk", label: "SDK", icon: "code-2" },
  { href: "/billing", label: "Facturation", icon: "credit-card" },
  { href: "/settings", label: "Paramètres", icon: "settings" },
];

// Icônes lucide importées statiquement pour rester simple avec le bundle.
 
import * as Icons from "lucide-react";

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, loading, refresh } = useUser();
  const router = useRouter();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    await refresh();
    router.push("/login");
    router.refresh();
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-zinc-400">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-emerald-500" />
          <span className="text-sm">Chargement de votre espace…</span>
        </div>
      </div>
    );
  }

  if (!user) {
    if (typeof window !== "undefined") {
      router.push("/login");
    }
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-zinc-400">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-500" />
      </div>
    );
  }

  const nav = user.role === "ADMIN"
    ? [...NAV_ITEMS, { href: "/admin", label: "Administration", icon: "shield-check" }]
    : NAV_ITEMS;

  const sidebar = (
    <div className="flex h-full flex-col">
      <Link href="/dashboard" className="flex items-center gap-2.5 px-5 h-16 border-b border-zinc-800/60">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500 font-mono font-bold text-zinc-950 text-sm">G3</div>
        <div className="leading-none">
          <div className="font-bold text-sm tracking-tight text-zinc-100">GEN<span className="text-emerald-400">3IA</span></div>
          <div className="text-[9px] text-zinc-500 font-mono uppercase tracking-widest">Task Center</div>
        </div>
      </Link>

      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5">
        {nav.map((item) => {
           
          const Icon = (Icons as any)[
            item.icon.split("-").map((p: string) => p.charAt(0).toUpperCase() + p.slice(1)).join("")
          ] ?? Icons.Circle;
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMenuOpen(false)}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                active
                  ? "bg-emerald-500/10 text-emerald-400 font-medium border border-emerald-500/20"
                  : "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/40 border border-transparent"
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-zinc-800/60 p-4">
        <div className="rounded-lg bg-zinc-900/50 border border-zinc-800 p-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-zinc-400">Crédits</span>
            <span className="font-mono font-semibold text-emerald-400">{formatCredits(user.credits)}</span>
          </div>
          <div className="mt-2 flex items-center gap-1.5">
            <Badge variant="outline" className="text-[10px] uppercase tracking-wide border-zinc-700 text-zinc-400">
              {user.plan}
            </Badge>
            {user.role === "ADMIN" && (
              <Badge variant="outline" className="text-[10px] uppercase tracking-wide border-emerald-700/50 text-emerald-400">
                <ShieldCheck className="h-3 w-3 mr-1" />
                admin
              </Badge>
            )}
          </div>
        </div>
        <Link href="/billing" className="mt-3 block">
          <Button size="sm" className="w-full bg-emerald-500/90 hover:bg-emerald-400 text-zinc-950 font-medium h-8 text-xs">
            <Coins className="h-3.5 w-3.5 mr-1.5" />
            Recharger
          </Button>
        </Link>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* Barre latérale fixe (desktop) */}
      <aside className="hidden lg:flex flex-col fixed inset-y-0 left-0 w-60 border-r border-zinc-800/60 bg-zinc-950 z-40">
        {sidebar}
      </aside>

      {/* Menu mobile */}
      {menuOpen && (
        <div className="lg:hidden fixed inset-0 z-50 bg-zinc-950/90 backdrop-blur-sm" onClick={() => setMenuOpen(false)}>
          <div
            className="fixed inset-y-0 left-0 w-64 border-r border-zinc-800 bg-zinc-950"
            onClick={(e) => e.stopPropagation()}
          >
            {sidebar}
          </div>
        </div>
      )}

      <div className="lg:pl-60 flex min-h-screen flex-col">
        {/* Barre supérieure */}
        <header className="sticky top-0 z-30 h-14 border-b border-zinc-800/60 bg-zinc-950/90 backdrop-blur-xl flex items-center justify-between px-4 sm:px-6">
          <button
            className="lg:hidden p-2 -ml-2 text-zinc-400 hover:text-white"
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label="Ouvrir le menu"
          >
            {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>

          <div className="flex items-center gap-2 text-sm text-zinc-500 font-mono">
            <span className="hidden sm:inline">crédits :</span>
            <span className="text-emerald-400 font-semibold">{formatCredits(user.credits)}</span>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden sm:block text-right leading-tight">
              <div className="text-sm font-medium text-zinc-200">{user.name ?? user.email}</div>
              <div className="text-[11px] text-zinc-500">{user.email}</div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={logout}
              className="text-zinc-400 hover:text-white hover:bg-zinc-800/60 h-9"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline ml-2">Déconnexion</span>
            </Button>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}

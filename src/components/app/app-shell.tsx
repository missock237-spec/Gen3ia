"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useUser, formatCredits } from "@/lib/client/hooks";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LanguageSwitcher } from "@/components/lang-switch";
import { useI18n } from "@/lib/i18n";
import { Loader2, LogOut, Menu, X, Coins, ShieldCheck } from "lucide-react";
import type { TranslationKey } from "@/lib/i18n/dictionaries";

const NAV_ITEMS: Array<{ href: string; key: TranslationKey; icon: string }> = [
  { href: "/dashboard", key: "nav.dashboard", icon: "gauge" },
  { href: "/agents", key: "nav.agents", icon: "bot" },
  { href: "/tasks", key: "nav.tasks", icon: "list-checks" },
  { href: "/workflows", key: "nav.workflows", icon: "sparkles" },
  { href: "/swarm", key: "nav.swarm", icon: "network" },
  { href: "/batch", key: "nav.batch", icon: "layers" },
  { href: "/knowledge", key: "nav.knowledge", icon: "book-open" },
  { href: "/skills", key: "nav.skills", icon: "graduation-cap" },
  { href: "/settings#tools", key: "nav.tools", icon: "wrench" },
  { href: "/connectors", key: "nav.connectors", icon: "plug" },
  { href: "/memory", key: "nav.memory", icon: "database" },
  { href: "/finetune", key: "nav.finetune", icon: "brain" },
  { href: "/watchdog", key: "nav.watchdog", icon: "eye" },
  { href: "/webhooks", key: "nav.webhooks", icon: "webhook" },
  { href: "/traces", key: "nav.traces", icon: "activity" },
  { href: "/live", key: "nav.live", icon: "radio" },
  { href: "/marketplace", key: "nav.marketplace", icon: "store" },
  { href: "/api", key: "nav.api", icon: "key-round" },
  { href: "/sdk", key: "nav.sdk", icon: "code-2" },
  { href: "/billing", key: "nav.billing", icon: "credit-card" },
  { href: "/ads", key: "nav.ads", icon: "megaphone" },
  { href: "/settings", key: "nav.settings", icon: "settings" },
];

// Icônes lucide importées statiquement pour rester simple avec le bundle.

import * as Icons from "lucide-react";

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, loading, refresh } = useUser();
  const router = useRouter();
  const pathname = usePathname();
  const { t } = useI18n();
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
          <span className="text-sm">{t("common.loadingSpace")}</span>
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
    ? [
        ...NAV_ITEMS,
        { href: "/admin", key: "nav.admin" as TranslationKey, icon: "shield-check" },
        { href: "/admin/oauth", key: "nav.adminOauth" as TranslationKey, icon: "key-round" },
      ]
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
              {t(item.key)}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-zinc-800/60 p-4">
        <div className="rounded-lg bg-zinc-900/50 border border-zinc-800 p-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-zinc-400">{t("nav.credits")}</span>
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
            {t("nav.recharge")}
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
            aria-label={t("nav.openMenu")}
          >
            {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>

          <div className="flex items-center gap-2 text-sm text-zinc-500 font-mono">
            <span className="hidden sm:inline">{t("nav.creditsLabel")}</span>
            <span className="text-emerald-400 font-semibold">{formatCredits(user.credits)}</span>
          </div>

          <div className="flex items-center gap-3">
            <LanguageSwitcher />
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
              <span className="hidden sm:inline ml-2">{t("nav.logout")}</span>
            </Button>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}

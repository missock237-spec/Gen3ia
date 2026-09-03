"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LanguageSwitcher } from "@/components/lang-switch";
import { useI18n } from "@/lib/i18n";
import { renderRich } from "@/lib/i18n/rich";
import type { TranslationKey } from "@/lib/i18n/dictionaries";
import {
  Brain, GitBranch, ShieldCheck, RefreshCcw, Database, Wrench,
  Code2, Zap, ArrowRight, Check, Sparkles, ChevronRight, Menu, X,
} from "lucide-react";

const STEP_KEYS: TranslationKey[] = [
  "landing.pipeline.step1.title",
  "landing.pipeline.step2.title",
  "landing.pipeline.step3.title",
  "landing.pipeline.step4.title",
  "landing.pipeline.step5.title",
  "landing.pipeline.step6.title",
  "landing.pipeline.step7.title",
  "landing.pipeline.step8.title",
  "landing.pipeline.step9.title",
];

const FEATURE_DEFS: Array<{ icon: typeof Brain; titleKey: TranslationKey; descKey: TranslationKey }> = [
  { icon: Brain, titleKey: "landing.features.f1.title", descKey: "landing.features.f1.desc" },
  { icon: GitBranch, titleKey: "landing.features.f2.title", descKey: "landing.features.f2.desc" },
  { icon: RefreshCcw, titleKey: "landing.features.f3.title", descKey: "landing.features.f3.desc" },
  { icon: ShieldCheck, titleKey: "landing.features.f4.title", descKey: "landing.features.f4.desc" },
  { icon: Database, titleKey: "landing.features.f5.title", descKey: "landing.features.f5.desc" },
  { icon: Wrench, titleKey: "landing.features.f6.title", descKey: "landing.features.f6.desc" },
  { icon: Zap, titleKey: "landing.features.f7.title", descKey: "landing.features.f7.desc" },
  { icon: Code2, titleKey: "landing.features.f8.title", descKey: "landing.features.f8.desc" },
];

const PLAN_DEFS: Array<{
  nameKey: TranslationKey;
  priceKey: TranslationKey;
  creditsKey: TranslationKey;
  ctaKey: TranslationKey;
  featureKeys: TranslationKey[];
  highlight: boolean;
}> = [
  {
    nameKey: "landing.pricing.free.name",
    priceKey: "landing.pricing.free.price",
    creditsKey: "landing.pricing.free.credits",
    ctaKey: "landing.pricing.free.cta",
    featureKeys: [
      "landing.pricing.free.f1",
      "landing.pricing.free.f2",
      "landing.pricing.free.f3",
      "landing.pricing.free.f4",
      "landing.pricing.free.f5",
    ],
    highlight: false,
  },
  {
    nameKey: "landing.pricing.starter.name",
    priceKey: "landing.pricing.starter.price",
    creditsKey: "landing.pricing.starter.credits",
    ctaKey: "landing.pricing.starter.cta",
    featureKeys: [
      "landing.pricing.starter.f1",
      "landing.pricing.starter.f2",
      "landing.pricing.starter.f3",
      "landing.pricing.starter.f4",
    ],
    highlight: false,
  },
  {
    nameKey: "landing.pricing.pro.name",
    priceKey: "landing.pricing.pro.price",
    creditsKey: "landing.pricing.pro.credits",
    ctaKey: "landing.pricing.pro.cta",
    featureKeys: [
      "landing.pricing.pro.f1",
      "landing.pricing.pro.f2",
      "landing.pricing.pro.f3",
      "landing.pricing.pro.f4",
      "landing.pricing.pro.f5",
    ],
    highlight: true,
  },
];

export default function LandingPage() {
  const { t } = useI18n();
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeStep, setActiveStep] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setActiveStep((s) => (s + 1) % STEP_KEYS.length), 2600);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-zinc-950 text-zinc-100">
      {/* Navigation */}
      <header className="sticky top-0 z-50 border-b border-zinc-800/60 bg-zinc-950/80 backdrop-blur-xl">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500 font-mono font-bold text-zinc-950 text-lg shadow-[0_0_24px_rgba(16,185,129,0.5)]">
              G3
            </div>
            <div className="leading-none">
              <div className="font-bold text-lg tracking-tight">GEN<span className="text-emerald-400">3IA</span></div>
              <div className="text-[10px] text-zinc-500 font-mono uppercase tracking-widest">Agent Orchestration</div>
            </div>
          </Link>

          <nav className="hidden md:flex items-center gap-6 text-sm text-zinc-400">
            <a href="#pipeline" className="hover:text-zinc-100 transition-colors">{t("landing.nav.pipeline")}</a>
            <a href="#fonctionnalites" className="hover:text-zinc-100 transition-colors">{t("landing.nav.features")}</a>
            <a href="#tarifs" className="hover:text-zinc-100 transition-colors">{t("landing.nav.pricing")}</a>
            <a href="/sdk" className="hover:text-zinc-100 transition-colors">{t("landing.nav.apiSdk")}</a>
          </nav>

          <div className="hidden md:flex items-center gap-3">
            <LanguageSwitcher />
            <Link href="/login">
              <Button variant="ghost" className="text-zinc-300 hover:text-white hover:bg-zinc-800/60">{t("landing.nav.login")}</Button>
            </Link>
            <Link href="/register">
              <Button className="bg-emerald-500 text-zinc-950 hover:bg-emerald-400 font-semibold shadow-[0_0_20px_rgba(16,185,129,0.35)]">
                {t("landing.nav.register")}
                <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            </Link>
          </div>

          <button
            className="md:hidden p-2 text-zinc-400 hover:text-white"
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label="Menu"
          >
            {menuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>

        {menuOpen && (
          <div className="md:hidden border-t border-zinc-800/60 px-4 py-4 space-y-3 bg-zinc-950">
            <div className="flex items-center justify-between">
              <LanguageSwitcher />
            </div>
            <a href="#pipeline" className="block text-sm text-zinc-300 py-2" onClick={() => setMenuOpen(false)}>{t("landing.nav.pipeline")}</a>
            <a href="#fonctionnalites" className="block text-sm text-zinc-300 py-2" onClick={() => setMenuOpen(false)}>{t("landing.nav.features")}</a>
            <a href="#tarifs" className="block text-sm text-zinc-300 py-2" onClick={() => setMenuOpen(false)}>{t("landing.nav.pricing")}</a>
            <div className="flex gap-3 pt-2">
              <Link href="/login" className="flex-1"><Button variant="outline" className="w-full border-zinc-700 text-zinc-200">{t("landing.nav.login")}</Button></Link>
              <Link href="/register" className="flex-1"><Button className="w-full bg-emerald-500 text-zinc-950 hover:bg-emerald-400">{t("landing.nav.register")}</Button></Link>
            </div>
          </div>
        )}
      </header>

      {/* Héro */}
      <main className="flex-1">
        <section className="relative overflow-hidden">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_50%_at_50%_0%,rgba(16,185,129,0.14),transparent)]" />
          <div className="mx-auto max-w-7xl px-4 sm:px-6 pt-16 pb-20 sm:pt-24 sm:pb-28 text-center relative">
            <Badge className="mb-6 bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/15 px-3 py-1">
              <Sparkles className="h-3.5 w-3.5 mr-1.5" />
              {t("landing.hero.badge")}
            </Badge>
            <h1 className="mx-auto max-w-4xl text-4xl sm:text-6xl font-bold tracking-tight leading-[1.08]">
              {t("landing.hero.title1")}{" "}
              <span className="bg-gradient-to-r from-emerald-400 via-teal-300 to-emerald-400 bg-clip-text text-transparent">
                {t("landing.hero.titleHighlight")}
              </span>
              <br className="hidden sm:block" /> {t("landing.hero.title2")}
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-base sm:text-lg text-zinc-400 leading-relaxed">
              {renderRich(t("landing.hero.desc"))}
            </p>
            <div className="mt-9 flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link href="/register" className="w-full sm:w-auto">
                <Button size="lg" className="w-full sm:w-auto bg-emerald-500 text-zinc-950 hover:bg-emerald-400 font-semibold h-12 px-8 text-base shadow-[0_0_30px_rgba(16,185,129,0.4)]">
                  {t("landing.hero.cta")}
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </Link>
              <a href="#pipeline" className="w-full sm:w-auto">
                <Button size="lg" variant="outline" className="w-full sm:w-auto h-12 px-8 text-base border-zinc-700 text-zinc-200 hover:bg-zinc-800/60 hover:border-zinc-600">
                  {t("landing.hero.ctaSecondary")}
                </Button>
              </a>
            </div>

            {/* Aperçu du pipeline */}
            <div className="mx-auto mt-14 max-w-3xl rounded-2xl border border-zinc-800 bg-zinc-900/50 p-1.5 shadow-2xl">
              <div className="rounded-xl bg-zinc-950 p-5 sm:p-7 font-mono text-left">
                <div className="flex items-center gap-2 mb-4">
                  <div className="h-3 w-3 rounded-full bg-red-500/70" />
                  <div className="h-3 w-3 rounded-full bg-yellow-500/70" />
                  <div className="h-3 w-3 rounded-full bg-emerald-500/70" />
                  <span className="ml-3 text-xs text-zinc-500">{t("landing.hero.terminalTitle")}</span>
                </div>
                <div className="space-y-1.5 text-[13px] leading-relaxed">
                  {STEP_KEYS.slice(0, 6).map((key, i) => (
                    <div
                      key={key}
                      className={`flex items-center gap-3 transition-colors duration-500 ${
                        i <= activeStep ? "text-zinc-200" : "text-zinc-600"
                      }`}
                    >
                      <span className={i <= activeStep ? "text-emerald-400" : "text-zinc-700"}>{i < activeStep ? "✓" : "▸"}</span>
                      <span className="text-zinc-500 w-28 shrink-0">{t(key).toLowerCase()}</span>
                      <span className="truncate text-zinc-600">
                        {i === activeStep ? t("landing.hero.terminalRunning") : i < activeStep ? t("landing.hero.terminalDone") : t("landing.hero.terminalPending")}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="mt-4 pt-3 border-t border-zinc-800/80 flex items-center gap-2 text-xs text-emerald-400">
                  <Check className="h-3.5 w-3.5" />
                  {t("landing.hero.verified")}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Pipeline */}
        <section id="pipeline" className="border-t border-zinc-800/60 bg-zinc-900/30 py-20">
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <div className="text-center mb-14">
              <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">{t("landing.pipeline.title")}</h2>
              <p className="mt-4 text-zinc-400 max-w-2xl mx-auto">
                {t("landing.pipeline.desc")}
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {STEP_KEYS.map((key, i) => (
                <div
                  key={key}
                  className="group relative rounded-xl border border-zinc-800 bg-zinc-950 p-5 hover:border-emerald-500/40 transition-colors"
                >
                  <div className="flex items-center gap-3 mb-3">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400 font-mono font-bold text-sm border border-emerald-500/20">
                      {i + 1}
                    </span>
                    <h3 className="font-semibold text-zinc-100">{t(key)}</h3>
                  </div>
                  <p className="text-sm text-zinc-400 leading-relaxed">
                    {t(`landing.pipeline.step${i + 1}.desc` as TranslationKey)}
                  </p>
                  {i + 1 < 9 && (
                    <ChevronRight className="absolute -right-2 top-1/2 h-4 w-4 text-zinc-800 hidden lg:block" />
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Fonctionnalités */}
        <section id="fonctionnalites" className="py-20">
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <div className="text-center mb-14">
              <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">{t("landing.features.title")}</h2>
              <p className="mt-4 text-zinc-400 max-w-2xl mx-auto">
                {t("landing.features.desc")}
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {FEATURE_DEFS.map((f) => (
                <div key={f.titleKey} className="rounded-xl border border-zinc-800 bg-zinc-950 p-5 hover:border-zinc-700 transition-colors">
                  <div className="mb-4 inline-flex rounded-lg bg-emerald-500/10 p-2.5 border border-emerald-500/20">
                    <f.icon className="h-5 w-5 text-emerald-400" />
                  </div>
                  <h3 className="font-semibold mb-2">{t(f.titleKey)}</h3>
                  <p className="text-sm text-zinc-400 leading-relaxed">{t(f.descKey)}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Tarifs */}
        <section id="tarifs" className="border-t border-zinc-800/60 bg-zinc-900/30 py-20">
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <div className="text-center mb-14">
              <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">{t("landing.pricing.title")}</h2>
              <p className="mt-4 text-zinc-400">
                {renderRich(t("landing.pricing.desc"))}
              </p>
            </div>
            <div className="grid gap-6 lg:grid-cols-3 max-w-5xl mx-auto">
              {PLAN_DEFS.map((plan) => (
                <div
                  key={plan.nameKey}
                  className={`relative rounded-2xl border p-7 ${
                    plan.highlight
                      ? "border-emerald-500/50 bg-zinc-950 shadow-[0_0_40px_rgba(16,185,129,0.12)]"
                      : "border-zinc-800 bg-zinc-950"
                  }`}
                >
                  {plan.highlight && (
                    <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-emerald-500 text-zinc-950 font-semibold hover:bg-emerald-500">
                      {t("landing.pricing.recommended")}
                    </Badge>
                  )}
                  <h3 className="text-lg font-semibold">{t(plan.nameKey)}</h3>
                  <div className="mt-3 text-3xl font-bold">{t(plan.priceKey)}</div>
                  <div className="mt-1 text-sm text-emerald-400">{t(plan.creditsKey)}</div>
                  <ul className="mt-6 space-y-2.5 text-sm text-zinc-300">
                    {plan.featureKeys.map((fk) => (
                      <li key={fk} className="flex items-start gap-2.5">
                        <Check className="h-4 w-4 text-emerald-400 mt-0.5 shrink-0" />
                        {t(fk)}
                      </li>
                    ))}
                  </ul>
                  <Link href="/register" className="mt-7 block">
                    <Button
                      className={`w-full font-medium ${
                        plan.highlight
                          ? "bg-emerald-500 text-zinc-950 hover:bg-emerald-400"
                          : "bg-zinc-800 text-zinc-100 hover:bg-zinc-700 border border-zinc-700"
                      }`}
                    >
                      {t(plan.ctaKey)}
                    </Button>
                  </Link>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA final */}
        <section className="py-20">
          <div className="mx-auto max-w-4xl px-4 sm:px-6 text-center">
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">
              {renderRich(t("landing.cta.title"))}
            </h2>
            <p className="mt-4 text-zinc-400">
              {t("landing.cta.desc")}
            </p>
            <Link href="/register" className="mt-8 inline-block">
              <Button size="lg" className="bg-emerald-500 text-zinc-950 hover:bg-emerald-400 font-semibold h-12 px-10 text-base shadow-[0_0_30px_rgba(16,185,129,0.4)]">
                {t("landing.cta.button")}
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </Link>
          </div>
        </section>
      </main>

      {/* Pied de page */}
      <footer className="border-t border-zinc-800/60 bg-zinc-950">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-10 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-zinc-500">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500 font-mono font-bold text-zinc-950 text-xs">G3</div>
            <span>{t("landing.footer.tagline")}</span>
          </div>
          <div className="flex items-center gap-6">
            <a href="/sdk" className="hover:text-zinc-300 transition-colors">{t("landing.footer.apiSdk")}</a>
            <a href="/login" className="hover:text-zinc-300 transition-colors">{t("landing.nav.login")}</a>
            <span>{t("landing.footer.copyright")}</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

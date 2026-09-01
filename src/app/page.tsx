"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Brain, GitBranch, ShieldCheck, RefreshCcw, Database, Wrench,
  Code2, Zap, ArrowRight, Check, Sparkles, ChevronRight, Menu, X,
} from "lucide-react";

const PIPELINE_STEPS = [
  { n: 1, title: "Comprendre", desc: "Analyse structurée de la demande : objectifs, contraintes, risques, critères de succès mesurables." },
  { n: 2, title: "Planifier", desc: "Génération de 5 stratégies distinctes (A à E), chacune avec étapes, outils et coûts estimés." },
  { n: 3, title: "Comparer", desc: "Moteur d'évaluation pondéré (succès, coût, latence, risque, complétude) — sélection traçable." },
  { n: 4, title: "Exécuter", desc: "Exécution pas-à-pas avec outils réels : recherche web, calculs, code sandboxé, RAG, mémoire." },
  { n: 5, title: "Vérifier", desc: "Confrontation du résultat aux critères de succès — preuve exigée pour chaque critère." },
  { n: 6, title: "Corriger", desc: "Détection, classification et correction des erreurs : reprise, changement de modèle ou re-planification." },
  { n: 7, title: "Évaluer", desc: "Métriques complètes : tokens, crédits, tentatives, confiance de vérification." },
  { n: 8, title: "Apprendre", desc: "Extraction des leçons durables, mémorisées pour améliorer les tâches suivantes." },
  { n: 9, title: "Livrer", desc: "Réponse finale avec preuves, plan utilisé, vérification et métriques — API et SDK inclus." },
];

const FEATURES = [
  {
    icon: Brain,
    title: "Prompt Analysis Engine",
    desc: "Chaque demande est décomposée en objectifs vérifiables, contraintes, capacités requises et critères de succès objectives.",
  },
  {
    icon: GitBranch,
    title: "Système des 5 plans",
    desc: "Jamais une seule stratégie : cinq plans radicalement différents, notés et comparés avant toute exécution.",
  },
  {
    icon: RefreshCcw,
    title: "Auto-correction",
    desc: "Erreurs classées (transitoire, logique, outil, modèle) et corrigées automatiquement — jusqu'au replan complet.",
  },
  {
    icon: ShieldCheck,
    title: "Vérification factuelle",
    desc: "Règle anti-hallucination : aucun critère validé sans preuve. Une tâche non prouvée échoue honnêtement.",
  },
  {
    icon: Database,
    title: "Mémoire 5 couches",
    desc: "Court terme, long terme, tâche, utilisateur et agent — vos agents apprennent de chaque exécution.",
  },
  {
    icon: Wrench,
    title: "Outils réels",
    desc: "Recherche web en direct, lecture de pages, calculs, exécution de code sandboxé, HTTP sortant sécurisé, RAG.",
  },
  {
    icon: Zap,
    title: "Human-in-the-loop",
    desc: "Les opérations sensibles demandent votre approbation explicite avant exécution. Vous gardez le contrôle.",
  },
  {
    icon: Code2,
    title: "API + SDK",
    desc: "Chaque agent publié expose un endpoint authentifié par clé, avec SDK JavaScript et Python prêts à l'emploi.",
  },
];

const PLANS = [
  {
    name: "Découverte",
    price: "Gratuit",
    credits: "25 crédits offerts",
    features: ["5 agents", "Task Center complet", "3 documents RAG", "API personnelle", "Mémoire standard"],
    cta: "Commencer gratuitement",
  },
  {
    name: "Starter",
    price: "2 000 FCFA",
    credits: "200 crédits",
    features: ["200 crédits d'exécution", "3 agents publiés", "Task Center complet", "API + SDK inclus"],
    cta: "Choisir Starter",
    highlight: false,
  },
  {
    name: "Pro",
    price: "10 000 FCFA",
    credits: "1 500 crédits",
    features: [
      "1 500 crédits d'exécution",
      "Agents illimités",
      "Publication marketplace",
      "Mémoire longue durée renforcée",
      "Support prioritaire",
    ],
    cta: "Choisir Pro",
    highlight: true,
  },
];

export default function LandingPage() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeStep, setActiveStep] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setActiveStep((s) => (s + 1) % PIPELINE_STEPS.length), 2600);
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
            <a href="#pipeline" className="hover:text-zinc-100 transition-colors">Pipeline</a>
            <a href="#fonctionnalites" className="hover:text-zinc-100 transition-colors">Fonctionnalités</a>
            <a href="#tarifs" className="hover:text-zinc-100 transition-colors">Tarifs</a>
            <a href="/sdk" className="hover:text-zinc-100 transition-colors">API / SDK</a>
          </nav>

          <div className="hidden md:flex items-center gap-3">
            <Link href="/login">
              <Button variant="ghost" className="text-zinc-300 hover:text-white hover:bg-zinc-800/60">Connexion</Button>
            </Link>
            <Link href="/register">
              <Button className="bg-emerald-500 text-zinc-950 hover:bg-emerald-400 font-semibold shadow-[0_0_20px_rgba(16,185,129,0.35)]">
                Créer un compte
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
            <a href="#pipeline" className="block text-sm text-zinc-300 py-2" onClick={() => setMenuOpen(false)}>Pipeline</a>
            <a href="#fonctionnalites" className="block text-sm text-zinc-300 py-2" onClick={() => setMenuOpen(false)}>Fonctionnalités</a>
            <a href="#tarifs" className="block text-sm text-zinc-300 py-2" onClick={() => setMenuOpen(false)}>Tarifs</a>
            <div className="flex gap-3 pt-2">
              <Link href="/login" className="flex-1"><Button variant="outline" className="w-full border-zinc-700 text-zinc-200">Connexion</Button></Link>
              <Link href="/register" className="flex-1"><Button className="w-full bg-emerald-500 text-zinc-950 hover:bg-emerald-400">Créer un compte</Button></Link>
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
              Moteur d'orchestration agentique — analyse, planification, exécution, vérification
            </Badge>
            <h1 className="mx-auto max-w-4xl text-4xl sm:text-6xl font-bold tracking-tight leading-[1.08]">
              Des agents IA qui{" "}
              <span className="bg-gradient-to-r from-emerald-400 via-teal-300 to-emerald-400 bg-clip-text text-transparent">
                exécutent vraiment
              </span>
              ,<br className="hidden sm:block" /> pas qui improvisent.
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-base sm:text-lg text-zinc-400 leading-relaxed">
              GEN3IA analyse votre demande, génère <strong className="text-zinc-200">cinq plans</strong>, les compare,
              exécute le meilleur avec des <strong className="text-zinc-200">outils réels</strong>, vérifie chaque
              résultat et corrige les échecs — avant de vous livrer une réponse prouvée.
            </p>
            <div className="mt-9 flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link href="/register" className="w-full sm:w-auto">
                <Button size="lg" className="w-full sm:w-auto bg-emerald-500 text-zinc-950 hover:bg-emerald-400 font-semibold h-12 px-8 text-base shadow-[0_0_30px_rgba(16,185,129,0.4)]">
                  Démarrer — 25 crédits offerts
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </Link>
              <a href="#pipeline" className="w-full sm:w-auto">
                <Button size="lg" variant="outline" className="w-full sm:w-auto h-12 px-8 text-base border-zinc-700 text-zinc-200 hover:bg-zinc-800/60 hover:border-zinc-600">
                  Voir le pipeline d'exécution
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
                  <span className="ml-3 text-xs text-zinc-500">task · gen3ia :: pipeline</span>
                </div>
                <div className="space-y-1.5 text-[13px] leading-relaxed">
                  {PIPELINE_STEPS.slice(0, 6).map((s, i) => (
                    <div
                      key={s.n}
                      className={`flex items-center gap-3 transition-colors duration-500 ${
                        i <= activeStep ? "text-zinc-200" : "text-zinc-600"
                      }`}
                    >
                      <span className={i <= activeStep ? "text-emerald-400" : "text-zinc-700"}>{i < activeStep ? "✓" : "▸"}</span>
                      <span className="text-zinc-500 w-28 shrink-0">{s.title.toLowerCase()}</span>
                      <span className="truncate text-zinc-600">
                        {i === activeStep ? "en cours…" : i < activeStep ? "terminé" : "en attente"}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="mt-4 pt-3 border-t border-zinc-800/80 flex items-center gap-2 text-xs text-emerald-400">
                  <Check className="h-3.5 w-3.5" />
                  vérification : tous les critères prouvés — livraison
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Pipeline */}
        <section id="pipeline" className="border-t border-zinc-800/60 bg-zinc-900/30 py-20">
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <div className="text-center mb-14">
              <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">Le pipeline d'exécution en 9 étapes</h2>
              <p className="mt-4 text-zinc-400 max-w-2xl mx-auto">
                Chaque phase est persistée (checkpoint) et traçable : vous suivez l'avancement en direct
                dans le Task Center, avec le détail de chaque décision.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {PIPELINE_STEPS.map((step) => (
                <div
                  key={step.n}
                  className="group relative rounded-xl border border-zinc-800 bg-zinc-950 p-5 hover:border-emerald-500/40 transition-colors"
                >
                  <div className="flex items-center gap-3 mb-3">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400 font-mono font-bold text-sm border border-emerald-500/20">
                      {step.n}
                    </span>
                    <h3 className="font-semibold text-zinc-100">{step.title}</h3>
                  </div>
                  <p className="text-sm text-zinc-400 leading-relaxed">{step.desc}</p>
                  {step.n < 9 && (
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
              <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">Une fiabilité d'ingénierie, pas des promesses</h2>
              <p className="mt-4 text-zinc-400 max-w-2xl mx-auto">
                Tous les moteurs sont réels et exécutés côté serveur : aucun résultat simulé, aucune réponse inventée.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {FEATURES.map((f) => (
                <div key={f.title} className="rounded-xl border border-zinc-800 bg-zinc-950 p-5 hover:border-zinc-700 transition-colors">
                  <div className="mb-4 inline-flex rounded-lg bg-emerald-500/10 p-2.5 border border-emerald-500/20">
                    <f.icon className="h-5 w-5 text-emerald-400" />
                  </div>
                  <h3 className="font-semibold mb-2">{f.title}</h3>
                  <p className="text-sm text-zinc-400 leading-relaxed">{f.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Tarifs */}
        <section id="tarifs" className="border-t border-zinc-800/60 bg-zinc-900/30 py-20">
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <div className="text-center mb-14">
              <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">Tarifs simples, en FCFA</h2>
              <p className="mt-4 text-zinc-400">
                Paiement par <strong className="text-zinc-200">Chariow</strong> — crédits consommés uniquement
                sur les exécutions réelles.
              </p>
            </div>
            <div className="grid gap-6 lg:grid-cols-3 max-w-5xl mx-auto">
              {PLANS.map((plan) => (
                <div
                  key={plan.name}
                  className={`relative rounded-2xl border p-7 ${
                    plan.highlight
                      ? "border-emerald-500/50 bg-zinc-950 shadow-[0_0_40px_rgba(16,185,129,0.12)]"
                      : "border-zinc-800 bg-zinc-950"
                  }`}
                >
                  {plan.highlight && (
                    <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-emerald-500 text-zinc-950 font-semibold hover:bg-emerald-500">
                      Recommandé
                    </Badge>
                  )}
                  <h3 className="text-lg font-semibold">{plan.name}</h3>
                  <div className="mt-3 text-3xl font-bold">{plan.price}</div>
                  <div className="mt-1 text-sm text-emerald-400">{plan.credits}</div>
                  <ul className="mt-6 space-y-2.5 text-sm text-zinc-300">
                    {plan.features.map((f) => (
                      <li key={f} className="flex items-start gap-2.5">
                        <Check className="h-4 w-4 text-emerald-400 mt-0.5 shrink-0" />
                        {f}
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
                      {plan.cta}
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
              Prêt à déléguer des tâches <span className="text-emerald-400">réellement exécutées</span> ?
            </h2>
            <p className="mt-4 text-zinc-400">
              Créez votre compte, décrivez une tâche, et observez le pipeline complet en action.
            </p>
            <Link href="/register" className="mt-8 inline-block">
              <Button size="lg" className="bg-emerald-500 text-zinc-950 hover:bg-emerald-400 font-semibold h-12 px-10 text-base shadow-[0_0_30px_rgba(16,185,129,0.4)]">
                Créer mon compte gratuit
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
            <span>GEN3IA — Orchestration d'agents IA</span>
          </div>
          <div className="flex items-center gap-6">
            <a href="/sdk" className="hover:text-zinc-300 transition-colors">API & SDK</a>
            <a href="/login" className="hover:text-zinc-300 transition-colors">Connexion</a>
            <span>© 2026 GEN3IA</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

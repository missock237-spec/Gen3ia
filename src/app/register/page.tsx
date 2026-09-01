"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, ArrowLeft, Check } from "lucide-react";

const BENEFITS = [
  "25 crédits d'exécution offerts",
  "Task Center avec pipeline complet visible",
  "5 agents et API personnelle",
  "Mémoire et base de connaissances",
];

export default function RegisterPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) {
      toast({
        title: "Mot de passe trop court",
        description: "Choisissez au moins 8 caractères.",
        variant: "destructive",
      });
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? "Inscription impossible.");
      }
      toast({
        title: "Compte créé 🎉",
        description: "25 crédits offerts viennent d'être crédités à votre compte.",
      });
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      toast({
        title: "Échec de l'inscription",
        description: err instanceof Error ? err.message : "Erreur inconnue.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-zinc-950 text-zinc-100">
      <div className="p-6">
        <Link href="/" className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-zinc-100 transition-colors">
          <ArrowLeft className="h-4 w-4" />
          Retour à l'accueil
        </Link>
      </div>
      <div className="flex-1 flex items-center justify-center px-4 pb-20">
        <div className="w-full max-w-4xl grid lg:grid-cols-2 gap-10 items-center">
          <div className="hidden lg:block">
            <h2 className="text-3xl font-bold tracking-tight leading-tight">
              Rejoignez la plateforme qui{" "}
              <span className="text-emerald-400">vérifie</span> avant de livrer.
            </h2>
            <ul className="mt-8 space-y-4">
              {BENEFITS.map((b) => (
                <li key={b} className="flex items-center gap-3 text-zinc-300">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500/15 border border-emerald-500/30">
                    <Check className="h-3.5 w-3.5 text-emerald-400" />
                  </span>
                  {b}
                </li>
              ))}
            </ul>
          </div>

          <div>
            <div className="text-center mb-8">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500 font-mono font-bold text-zinc-950 text-lg shadow-[0_0_24px_rgba(16,185,129,0.5)]">
                G3
              </div>
              <h1 className="text-2xl font-bold tracking-tight">Créer votre compte</h1>
              <p className="mt-2 text-sm text-zinc-400">Aucune carte requise pour commencer.</p>
            </div>

            <form onSubmit={onSubmit} className="space-y-5 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-7">
              <div className="space-y-2">
                <Label htmlFor="name">Nom complet</Label>
                <Input
                  id="name"
                  required
                  minLength={2}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Votre nom"
                  className="bg-zinc-950 border-zinc-800 focus-visible:ring-emerald-500/40"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Adresse e-mail</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="vous@exemple.com"
                  className="bg-zinc-950 border-zinc-800 focus-visible:ring-emerald-500/40"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Mot de passe</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="8 caractères minimum"
                  className="bg-zinc-950 border-zinc-800 focus-visible:ring-emerald-500/40"
                />
              </div>
              <Button
                type="submit"
                disabled={loading || !name || !email || !password}
                className="w-full bg-emerald-500 text-zinc-950 hover:bg-emerald-400 font-semibold h-11"
              >
                {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : "Créer mon compte"}
              </Button>
              <p className="text-center text-sm text-zinc-400">
                Déjà inscrit ?{" "}
                <Link href="/login" className="text-emerald-400 hover:text-emerald-300 font-medium">
                  Se connecter
                </Link>
              </p>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}

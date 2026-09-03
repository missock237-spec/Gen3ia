"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, ArrowLeft, Check } from "lucide-react";
import { OAuthButtons } from "@/components/auth/oauth-buttons";
import { LanguageSwitcher } from "@/components/lang-switch";
import { useI18n } from "@/lib/i18n";
import { validatePasswordStrength } from "@/lib/auth/password-client";

import type { TranslationKey } from "@/lib/i18n/dictionaries";

const BENEFIT_KEYS: TranslationKey[] = [
  "auth.register.benefit1",
  "auth.register.benefit2",
  "auth.register.benefit3",
  "auth.register.benefit4",
];

export default function RegisterPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { t } = useI18n();
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const strength = validatePasswordStrength(password);
    if (!strength.valid) {
      toast({
        title: t("auth.register.passwordWeakTitle"),
        description: t("auth.register.passwordWeakDesc"),
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
        throw new Error(data.error ?? t("auth.register.impossible"));
      }
      toast({
        title: t("auth.register.successTitle"),
        description: t("auth.register.successDesc"),
      });
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      toast({
        title: t("auth.register.failTitle"),
        description: err instanceof Error ? err.message : t("auth.unknownError"),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-zinc-950 text-zinc-100">
      <div className="flex items-center justify-between p-6">
        <Link href="/" className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-zinc-100 transition-colors">
          <ArrowLeft className="h-4 w-4" />
          {t("auth.backHome")}
        </Link>
        <LanguageSwitcher />
      </div>
      <div className="flex-1 flex items-center justify-center px-4 pb-20">
        <div className="w-full max-w-4xl grid lg:grid-cols-2 gap-10 items-center">
          <div className="hidden lg:block">
            <h2 className="text-3xl font-bold tracking-tight leading-tight">
              {t("auth.register.heading")}{" "}
              <span className="text-emerald-400">{t("auth.register.headingHighlight")}</span>{" "}
              {t("auth.register.headingTail")}
            </h2>
            <ul className="mt-8 space-y-4">
              {BENEFIT_KEYS.map((k) => (
                <li key={k} className="flex items-center gap-3 text-zinc-300">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500/15 border border-emerald-500/30">
                    <Check className="h-3.5 w-3.5 text-emerald-400" />
                  </span>
                  {t(k)}
                </li>
              ))}
            </ul>
          </div>

          <div>
            <div className="text-center mb-8">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500 font-mono font-bold text-zinc-950 text-lg shadow-[0_0_24px_rgba(16,185,129,0.5)]">
                G3
              </div>
              <h1 className="text-2xl font-bold tracking-tight">{t("auth.register.title")}</h1>
              <p className="mt-2 text-sm text-zinc-400">{t("auth.register.subtitle")}</p>
            </div>

            <form onSubmit={onSubmit} className="space-y-5 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-7">
              <div className="space-y-2">
                <Label htmlFor="name">{t("auth.register.name")}</Label>
                <Input
                  id="name"
                  required
                  minLength={2}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t("auth.register.namePlaceholder")}
                  className="bg-zinc-950 border-zinc-800 focus-visible:ring-emerald-500/40"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">{t("auth.register.email")}</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t("auth.emailPlaceholder")}
                  className="bg-zinc-950 border-zinc-800 focus-visible:ring-emerald-500/40"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">{t("auth.register.password")}</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={12}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={t("auth.register.passwordPlaceholder")}
                  className="bg-zinc-950 border-zinc-800 focus-visible:ring-emerald-500/40"
                />
                <p className="text-[11px] leading-relaxed text-zinc-500">{t("auth.register.passwordHint")}</p>
              </div>
              <Button
                type="submit"
                disabled={loading || !name || !email || !password}
                className="w-full bg-emerald-500 text-zinc-950 hover:bg-emerald-400 font-semibold h-11"
              >
                {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : t("auth.register.submit")}
              </Button>
              <OAuthButtons redirectTo="/dashboard" />
              <p className="text-center text-sm text-zinc-400">
                {t("auth.register.already")}{" "}
                <Link href="/login" className="text-emerald-400 hover:text-emerald-300 font-medium">
                  {t("auth.register.loginLink")}
                </Link>
              </p>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, ArrowLeft } from "lucide-react";
import { OAuthButtons, OAuthErrorNotice } from "@/components/auth/oauth-buttons";
import { LanguageSwitcher } from "@/components/lang-switch";
import { useI18n } from "@/lib/i18n";

export default function LoginPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { t } = useI18n();
  const [oauthError] = useState(() =>
    typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("error") : null
  );
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? t("auth.login.impossible"));
      }
      toast({ title: t("auth.login.successTitle"), description: t("auth.login.successDesc") });
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      toast({
        title: t("auth.login.failTitle"),
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
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500 font-mono font-bold text-zinc-950 text-lg shadow-[0_0_24px_rgba(16,185,129,0.5)]">
              G3
            </div>
            <h1 className="text-2xl font-bold tracking-tight">{t("auth.login.title")}</h1>
            <p className="mt-2 text-sm text-zinc-400">{t("auth.login.subtitle")}</p>
          </div>

          <OAuthErrorNotice error={oauthError} />

          <form onSubmit={onSubmit} className="space-y-5 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-7">
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
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="bg-zinc-950 border-zinc-800 focus-visible:ring-emerald-500/40"
              />
            </div>
            <Button
              type="submit"
              disabled={loading || !email || !password}
              className="w-full bg-emerald-500 text-zinc-950 hover:bg-emerald-400 font-semibold h-11"
            >
              {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : t("auth.login.submit")}
            </Button>
            <OAuthButtons redirectTo="/dashboard" />
            <p className="text-center text-sm text-zinc-400">
              {t("auth.login.noAccount")}{" "}
              <Link href="/register" className="text-emerald-400 hover:text-emerald-300 font-medium">
                {t("auth.login.createAccount")}
              </Link>
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}

"use client";

import { Languages } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/**
 * Sélecteur de langue (FR/EN) — persisté localStorage + profil + cookie.
 * Utilisable dans la coque applicative et les pages publiques.
 */
export function LanguageSwitcher({ className }: { className?: string }) {
  const { lang, setLang } = useI18n();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={cn("h-8 gap-1.5 px-2 text-xs text-zinc-400 hover:text-zinc-100", className)}
          aria-label="Language / Langue"
        >
          <Languages className="h-4 w-4" />
          <span className="font-mono uppercase">{lang}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="border-zinc-800 bg-zinc-900">
        <DropdownMenuItem
          onClick={() => setLang("fr")}
          className={lang === "fr" ? "bg-emerald-500/10 text-emerald-400" : "text-zinc-300"}
        >
          🇫🇷 Français
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => setLang("en")}
          className={lang === "en" ? "bg-emerald-500/10 text-emerald-400" : "text-zinc-300"}
        >
          🇬🇧 English
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

"use client";

import { Badge } from "@/components/ui/badge";
import {
  CheckCircle2, XCircle, Clock, Loader2, PauseCircle, AlertTriangle, HelpCircle, Ban,
} from "lucide-react";

/** Badge de statut unifié (tâches, agents, paiements). */
const STATUS_MAP: Record<string, { label: string; className: string; icon: React.ReactNode }> = {
  QUEUED: { label: "En file", className: "border-zinc-600 text-zinc-300", icon: <Clock className="h-3 w-3" /> },
  ANALYZING: { label: "Analyse", className: "border-amber-600/50 text-amber-300", icon: <Loader2 className="h-3 w-3 animate-spin" /> },
  PLANNING: { label: "Planification", className: "border-amber-600/50 text-amber-300", icon: <Loader2 className="h-3 w-3 animate-spin" /> },
  SIMULATING: { label: "Simulation", className: "border-amber-600/50 text-amber-300", icon: <Loader2 className="h-3 w-3 animate-spin" /> },
  EXECUTING: { label: "Exécution", className: "border-teal-600/50 text-teal-300", icon: <Loader2 className="h-3 w-3 animate-spin" /> },
  VERIFYING: { label: "Vérification", className: "border-teal-600/50 text-teal-300", icon: <Loader2 className="h-3 w-3 animate-spin" /> },
  LEARNING: { label: "Apprentissage", className: "border-teal-600/50 text-teal-300", icon: <Loader2 className="h-3 w-3 animate-spin" /> },
  WAITING_FOR_HUMAN: { label: "Confirmation requise", className: "border-orange-500/50 text-orange-300", icon: <HelpCircle className="h-3 w-3" /> },
  COMPLETED: { label: "Terminée", className: "border-emerald-600/50 text-emerald-300", icon: <CheckCircle2 className="h-3 w-3" /> },
  FAILED: { label: "Échec", className: "border-red-600/50 text-red-300", icon: <XCircle className="h-3 w-3" /> },
  CANCELLED: { label: "Annulée", className: "border-zinc-600 text-zinc-400", icon: <Ban className="h-3 w-3" /> },
  DRAFT: { label: "Brouillon", className: "border-zinc-600 text-zinc-300", icon: <PauseCircle className="h-3 w-3" /> },
  PUBLISHED: { label: "Publié", className: "border-emerald-600/50 text-emerald-300", icon: <CheckCircle2 className="h-3 w-3" /> },
  PAUSED: { label: "En pause", className: "border-amber-600/50 text-amber-300", icon: <PauseCircle className="h-3 w-3" /> },
  ARCHIVED: { label: "Archivé", className: "border-zinc-600 text-zinc-400", icon: <Ban className="h-3 w-3" /> },
  PENDING: { label: "En attente", className: "border-amber-600/50 text-amber-300", icon: <Clock className="h-3 w-3" /> },
  SUCCEEDED: { label: "Réussi", className: "border-emerald-600/50 text-emerald-300", icon: <CheckCircle2 className="h-3 w-3" /> },
  FREE: { label: "Gratuit", className: "border-zinc-600 text-zinc-300", icon: null },
  PRO: { label: "Pro", className: "border-emerald-600/50 text-emerald-300", icon: null },
  ENTERPRISE: { label: "Business", className: "border-emerald-500/60 text-emerald-300", icon: null },
}

export function StatusBadge({ status }: { status: string }) {
  const s = STATUS_MAP[status] ?? {
    label: status,
    className: "border-zinc-600 text-zinc-300",
    icon: <AlertTriangle className="h-3 w-3" />,
  }
  return (
    <Badge variant="outline" className={`shrink-0 text-[11px] font-normal gap-1 ${s.className}`}>
      {s.icon}
      {s.label}
    </Badge>
  )
}

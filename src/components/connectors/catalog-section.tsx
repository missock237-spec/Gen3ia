"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useI18n } from "@/lib/i18n";
import type { TranslationKey } from "@/lib/i18n/dictionaries";
import {
  Search,
  Loader2,
  PlugZap,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Layers,
  Wrench,
  Zap,
  KeyRound,
  Hourglass,
} from "lucide-react";

/**
 * Catalogue des applications (1467 apps — données Composio publiques).
 * L'utilisateur clique « Connecter » et autorise son compte : c'est tout.
 * Le flux OAuth utilise les identifiants de la plateforme (registre
 * opérateur), jamais ceux de l'utilisateur.
 */

interface CatalogItem {
  slug: string;
  name: string;
  logo: string | null;
  description: string | null;
  category: string;
  authSchemes: string[];
  toolCount: number;
  triggerCount: number;
  status: string; // OAUTH_READY | KEY_IMPORT | COMING_SOON
  credSource: string | null;
  native: boolean;
}

interface CatalogDetail {
  app: CatalogItem & { version: string | null };
  connectivity: {
    native: boolean;
    actionCount: number;
    connectable: boolean;
    mode: string;
    reason: string | null;
    credSource: string | null;
    inRegistry: boolean;
    docsUrl: string | null;
  };
  tools: Array<{ slug: string; name: string; description: string | null }>;
  toolsTotal: number;
  toolsPage: number;
  toolsPageSize: number;
  triggers: Array<{ slug: string; name: string; description: string | null }>;
  triggersTotal: number;
}

const STATUS_META: Record<string, { labelKey: TranslationKey; cls: string; icon: React.ReactNode }> = {
  OAUTH_READY: {
    labelKey: "connectors.catalog.statusOauth",
    cls: "border-emerald-700/50 text-emerald-300",
    icon: <PlugZap className="h-3.5 w-3.5" />,
  },
  KEY_IMPORT: {
    labelKey: "connectors.catalog.statusKey",
    cls: "border-blue-700/50 text-blue-300",
    icon: <KeyRound className="h-3.5 w-3.5" />,
  },
  COMING_SOON: {
    labelKey: "connectors.catalog.statusComing",
    cls: "border-zinc-700 text-zinc-400",
    icon: <Hourglass className="h-3.5 w-3.5" />,
  },
};

function AppLogo({ logo, name, size }: { logo: string | null; name: string; size: number }) {
  if (!logo) {
    return (
      <div
        className="flex items-center justify-center rounded-lg bg-zinc-800 text-zinc-300 font-bold"
        style={{ width: size, height: size, fontSize: size / 2.6 }}
      >
        {name.slice(0, 2).toUpperCase()}
      </div>
    )
  }
  return (
     
    <img
      src={logo}
      alt={name}
      width={size}
      height={size}
      loading="lazy"
      className="rounded-lg bg-white object-contain p-0.5"
      style={{ width: size, height: size }}
    />
  )
}

export function CatalogSection({ onConnected }: { onConnected?: () => void }) {
  const { toast } = useToast();
  const { t } = useI18n();
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [stats, setStats] = useState<{ apps: number; tools: number; triggers: number; categories: Array<{ name: string; count: number }>; oauthApps: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [category, setCategory] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [detail, setDetail] = useState<CatalogDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Recherche débouncée (300 ms).
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (debouncedSearch) params.set("search", debouncedSearch);
      if (category) params.set("category", category);
      params.set("page", String(page));
      params.set("pageSize", "24");
      const res = await fetch(`/api/connectors/catalog?${params.toString()}`);
      const json = (await res.json()) as {
        ok: boolean;
        apps?: CatalogItem[];
        total?: number;
        totalPages?: number;
      };
      if (json.ok && json.apps) {
        setItems(json.apps);
        setTotal(json.total ?? 0);
        setTotalPages(json.totalPages ?? 1);
      }
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, category, page]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/connectors/catalog?stats=1");
      const json = (await res.json()) as { ok: boolean; stats?: typeof stats };
      if (json.ok && json.stats) setStats(json.stats);
    })();
  }, []);

  async function openDetail(slug: string, toolPage = 1) {
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/connectors/catalog/${slug}?toolsPage=${toolPage}&toolsPageSize=30`);
      const json = (await res.json()) as { ok: boolean } & CatalogDetail;
      if (json.ok) setDetail(json as CatalogDetail);
    } finally {
      setDetailLoading(false);
    }
  }

  async function connect(app: CatalogItem) {
    setBusy(app.slug);
    try {
      const res = await fetch("/api/connectors/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appSlug: app.slug }),
      });
      const json = (await res.json()) as {
        ok: boolean;
        mode?: string;
        redirectUrl?: string | null;
        error?: string;
      };
      if (json.ok && json.redirectUrl) {
        window.location.href = json.redirectUrl;
        return;
      }
      if (json.ok && json.mode === "DIRECT") {
        toast({ title: t("connectors.toast.saved"), description: t("connectors.toast.savedDesc", { app: app.name }) });
        onConnected?.();
        await load();
        return;
      }
      toast({
        title: t("connectors.toast.connectFailed"),
        description: json.error ?? t("connectors.catalog.notActivated"),
        variant: "destructive",
      });
    } catch (err) {
      toast({
        title: t("common.errorNetwork"),
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      setBusy(null);
    }
  }

  const topCategories = stats?.categories.slice(0, 12) ?? [];

  return (
    <section className="space-y-4">
      {/* Bandeau statistiques */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: t("connectors.catalog.apps"), value: stats?.apps ?? "…", icon: <Layers className="h-4 w-4 text-emerald-400" /> },
          { label: t("connectors.catalog.tools"), value: stats?.tools?.toLocaleString("fr-FR") ?? "…", icon: <Wrench className="h-4 w-4 text-emerald-400" /> },
          { label: t("connectors.catalog.triggers"), value: stats?.triggers?.toLocaleString("fr-FR") ?? "…", icon: <Zap className="h-4 w-4 text-emerald-400" /> },
          { label: t("connectors.catalog.categories"), value: stats?.categories.length ?? "…", icon: <Layers className="h-4 w-4 text-emerald-400" /> },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-3">
            <div className="flex items-center gap-2 text-zinc-400 text-xs">{s.icon}{s.label}</div>
            <div className="mt-1 text-lg font-bold text-zinc-100">{s.value}</div>
          </div>
        ))}
      </div>

      {/* Recherche + filtres */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("connectors.catalog.searchPlaceholder")}
            className="pl-10 bg-zinc-950 border-zinc-800"
          />
        </div>
        <select
          value={category}
          onChange={(e) => {
            setCategory(e.target.value);
            setPage(1);
          }}
          className="h-9 rounded-md border border-zinc-800 bg-zinc-950 px-3 text-sm text-zinc-200"
        >
          <option value="">{t("connectors.catalog.allCategories")}</option>
          {topCategories.map((c) => (
            <option key={c.name} value={c.name}>
              {c.name} ({c.count})
            </option>
          ))}
        </select>
      </div>

      {/* Grille du catalogue */}
      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-36 rounded-xl" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-8 text-center text-zinc-400">
          {t("connectors.catalog.empty", { query: debouncedSearch })}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {items.map((app) => {
            const meta = STATUS_META[app.status] ?? STATUS_META.COMING_SOON;
            const ready = app.status === "OAUTH_READY";
            return (
              <div
                key={app.slug}
                className="group flex flex-col rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 transition-colors hover:border-zinc-600"
              >
                <button
                  onClick={() => void openDetail(app.slug)}
                  className="flex items-start gap-3 text-left"
                >
                  <AppLogo logo={app.logo} name={app.name} size={40} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="truncate font-semibold text-zinc-100">{app.name}</h3>
                      {app.native && (
                        <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-400" aria-label={t("connectors.catalog.nativeAria")} />
                      )}
                    </div>
                    <p className="mt-0.5 line-clamp-2 text-xs text-zinc-500">{app.description ?? app.slug}</p>
                  </div>
                </button>
                <div className="mt-3 flex items-center justify-between gap-2">
                  <Badge variant="outline" className={`gap-1 ${meta.cls}`}>
                    {meta.icon} {t(meta.labelKey)}
                  </Badge>
                  <span className="text-[10px] text-zinc-600">{t("connectors.catalog.toolsCount", { count: app.toolCount })}</span>
                </div>
                <Button
                  size="sm"
                  disabled={busy === app.slug || app.status === "COMING_SOON"}
                  onClick={() => void connect(app)}
                  className={`mt-3 w-full ${ready ? "bg-emerald-500 text-zinc-950 hover:bg-emerald-400" : "bg-zinc-800 text-zinc-200 hover:bg-zinc-700"}`}
                >
                  {busy === app.slug ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : ready ? (
                    <>
                      <PlugZap className="h-4 w-4" /> {t("connectors.connect")}
                    </>
                  ) : app.status === "KEY_IMPORT" ? (
                    <>
                      <KeyRound className="h-4 w-4" /> {t("connectors.catalog.addKey")}
                    </>
                  ) : (
                    t("connectors.catalog.notEnabled")
                  )}
                </Button>
              </div>
            )
          })}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-xs text-zinc-500">
            {t("connectors.catalog.pagination", {
              page,
              totalPages,
              total: total.toLocaleString("fr-FR"),
            })}
          </span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              <ChevronLeft className="h-4 w-4" /> {t("connectors.catalog.prev")}
            </Button>
            <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
              {t("common.next")} <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Dialogue de détail */}
      <Dialog open={!!detail} onOpenChange={(open) => !open && setDetail(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl border-zinc-800 bg-zinc-950">
          {detailLoading || !detail ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-emerald-500" />
            </div>
          ) : (
            <>
              <DialogHeader>
                <div className="flex items-center gap-3">
                  <AppLogo logo={detail.app.logo} name={detail.app.name} size={48} />
                  <div>
                    <DialogTitle className="text-zinc-100">{detail.app.name}</DialogTitle>
                    <DialogDescription className="mt-0.5 text-xs">
                      {detail.app.category} · {t("connectors.catalog.toolsCount", { count: detail.app.toolCount })} · {t("connectors.catalog.triggersCount", { count: detail.app.triggerCount })}
                      {detail.connectivity.docsUrl && (
                        <a
                          href={detail.connectivity.docsUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="ml-2 text-emerald-400 hover:text-emerald-300"
                        >
                          {t("connectors.catalog.documentation")}
                        </a>
                      )}
                    </DialogDescription>
                  </div>
                </div>
              </DialogHeader>

              <p className="text-sm text-zinc-300">{detail.app.description}</p>

              <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  {detail.connectivity.native && (
                    <Badge variant="outline" className="border-emerald-700/50 text-emerald-300">
                      {t("connectors.catalog.nativeActions", { count: detail.connectivity.actionCount })}
                    </Badge>
                  )}
                  {detail.connectivity.connectable ? (
                    <Badge variant="outline" className="border-emerald-700/50 text-emerald-300">
                      {t("connectors.catalog.oauthReady")}
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="border-zinc-700 text-zinc-400">
                      {detail.connectivity.reason ?? t("connectors.catalog.operatorRequired")}
                    </Badge>
                  )}
                  {detail.connectivity.credSource === "ADMIN" && (
                    <Badge variant="outline" className="border-blue-700/50 text-blue-300">
                      {t("connectors.catalog.platformCreds")}
                    </Badge>
                  )}
                </div>
                <Button
                  disabled={busy === detail.app.slug || !detail.connectivity.connectable}
                  onClick={() => void connect(detail.app)}
                  className="mt-3 w-full bg-emerald-500 text-zinc-950 hover:bg-emerald-400"
                >
                  {busy === detail.app.slug ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    t("connectors.catalog.connectAccount")
                  )}
                </Button>
                <p className="mt-2 text-center text-[11px] text-zinc-500">
                  {t("connectors.catalog.redirectHint", { app: detail.app.name })}
                </p>
              </div>

              {/* Outils */}
              {detail.tools.length > 0 && (
                <div>
                  <h4 className="mb-2 text-xs font-semibold uppercase tracking-widest text-zinc-500">
                    {t("connectors.catalog.toolsTitle", { count: detail.toolsTotal.toLocaleString("fr-FR") })}
                  </h4>
                  <div className="max-h-72 space-y-1.5 overflow-y-auto pr-2">
                    {detail.tools.map((tool) => (
                      <div key={tool.slug} className="rounded-lg border border-zinc-800/60 bg-zinc-900/30 px-3 py-2">
                        <div className="text-xs font-medium text-zinc-200">{tool.name}</div>
                        {tool.description && (
                          <div className="mt-0.5 line-clamp-2 text-[11px] text-zinc-500">{tool.description}</div>
                        )}
                      </div>
                    ))}
                  </div>
                  {detail.toolsTotal > detail.toolsPageSize && (
                    <div className="mt-2 flex items-center justify-between">
                      <span className="text-[11px] text-zinc-600">
                        {t("connectors.catalog.toolsRange", {
                          from: (detail.toolsPage - 1) * detail.toolsPageSize + 1,
                          to: Math.min(detail.toolsPage * detail.toolsPageSize, detail.toolsTotal),
                          total: detail.toolsTotal,
                        })}
                      </span>
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={detail.toolsPage <= 1}
                          onClick={() => void openDetail(detail.app.slug, detail.toolsPage - 1)}
                        >
                          <ChevronLeft className="h-3 w-3" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={detail.toolsPage * detail.toolsPageSize >= detail.toolsTotal}
                          onClick={() => void openDetail(detail.app.slug, detail.toolsPage + 1)}
                        >
                          <ChevronRight className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <DialogFooter className="text-[11px] text-zinc-500">
                {t("connectors.catalog.footer")}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}

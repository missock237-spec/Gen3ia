"use client";

import { useCallback, useEffect, useRef, useState } from "react"

/** Hooks d'accès client à l'API GEN3IA. */

export interface CurrentUser {
  id: string
  email: string
  name: string | null
  role: string
  plan: string
  credits: number
  createdAt: string
  settings: {
    defaultProvider: string
    defaultModel: string
    maxAttempts: number
    confirmDangerousOps: boolean
    language: string
    planApproval?: "auto" | "manual"
  }
}

export interface ProviderInfo {
  key: string
  name: string
  available: boolean
}

export function useUser() {
  const [user, setUser] = useState<CurrentUser | null>(null)
  const [providers, setProviders] = useState<ProviderInfo[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/me")
      const data = await res.json()
      setUser(data.user ?? null)
      setProviders(data.providers ?? [])
    } catch {
      setUser(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return { user, providers, loading, refresh }
}

/** Sondage générique avec rechargement automatique. */
export function usePolling<T>(url: string | null, intervalMs: number | null = null) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const load = useCallback(async () => {
    if (!url) return
    try {
      const res = await fetch(url)
      const json = await res.json()
      if (!res.ok || !json.ok) {
        setError(json.error ?? `Erreur ${res.status}`)
        setData(null)
      } else {
        setError(null)
        setData(json)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur réseau")
    } finally {
      setLoading(false)
    }
  }, [url])

  useEffect(() => {
    if (!url) {
      setLoading(false)
      return
    }
    void load()
    if (intervalMs && intervalMs > 0) {
      intervalRef.current = setInterval(() => void load(), intervalMs)
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [url, intervalMs, load])

  return { data, error, loading, reload: load }
}

/** Requête GET JSON typée. */
export async function apiGet<T = Record<string, unknown>>(
  url: string
): Promise<{ ok: boolean; error?: string } & T> {
  const res = await fetch(url)
  const data = await res.json().catch(() => ({ ok: false, error: "Réponse invalide." }))
  return data
}

/** Requête POST JSON typée. */
export async function apiPost<T = Record<string, unknown>>(
  url: string,
  body: unknown
): Promise<{ ok: boolean; error?: string } & T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({ ok: false, error: "Réponse invalide." }))
  return data
}

export async function apiPatch<T = Record<string, unknown>>(
  url: string,
  body: unknown
): Promise<{ ok: boolean; error?: string } & T> {
  const res = await fetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({ ok: false, error: "Réponse invalide." }))
  return data
}

export async function apiDelete(url: string): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(url, { method: "DELETE" })
  return res.json().catch(() => ({ ok: false, error: "Réponse invalide." }))
}

/** Format monétaire lisible. */
export function formatCredits(n: number): string {
  return n.toLocaleString("fr-FR", { maximumFractionDigits: 2 })
}

export function formatDate(d: string | Date | null | undefined): string {
  if (!d) return "—"
  return new Date(d).toLocaleString("fr-FR", {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
  })
}

"use client";

import type { ReactNode } from "react";

/**
 * Texte riche i18n — convertit les marqueurs du dictionnaire en éléments :
 *   {strong}…{/strong}   → <strong className="text-zinc-200">
 *   {highlight}…{/highlight} → <span className="text-emerald-400">
 * Tout le reste est renvoyé tel quel (texte brut).
 */
export function renderRich(text: string): ReactNode[] {
  const re = /\{(\w+)\}([\s\S]*?)\{\/\1\}/g
  const out: ReactNode[] = []
  let last = 0
  let m: RegExpExecArray | null
  let k = 0
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index))
    if (m[1] === "highlight") {
      out.push(
        <span key={`r${k++}`} className="text-emerald-400">
          {m[2]}
        </span>
      )
    } else {
      out.push(
        <strong key={`r${k++}`} className="text-zinc-200">
          {m[2]}
        </strong>
      )
    }
    last = m.index + m[0].length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

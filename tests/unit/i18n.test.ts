import { describe, test, expect } from "bun:test"

/**
 * Tests du système i18n bilingue (FR/EN) :
 * parité des dictionnaires, interpolation, repli français.
 */

import { DICTIONARIES, type TranslationKey } from "@/lib/i18n/dictionaries"
import { translate } from "@/lib/i18n/index"

const frKeys = Object.keys(DICTIONARIES.fr).sort()
const enKeys = Object.keys(DICTIONARIES.en).sort()

describe("i18n — dictionnaires bilingues", () => {
  test("parité stricte : chaque clé fr existe en en et réciproquement", () => {
    expect(frKeys.length).toBeGreaterThan(500)
    expect(enKeys.length).toBe(frKeys.length)
    const frSet = new Set(frKeys)
    const enSet = new Set(enKeys)
    for (const k of frKeys) {
      if (!enSet.has(k)) throw new Error(`Clé absente en EN : ${k}`)
    }
    for (const k of enKeys) {
      if (!frSet.has(k)) throw new Error(`Clé absente en FR : ${k}`)
    }
  })

  test("aucune valeur vide ni clé non traduite dans les deux langues", () => {
    // Autonymes et libellés volontairement identiques (noms de langues,
    // templates dont le texte restant est un mot commun aux deux langues).
    const identicalAllowed = new Set(["common.french", "common.english", "memory.item.meta"])
    for (const k of frKeys) {
      const frVal = DICTIONARIES.fr[k as TranslationKey]
      const enVal = DICTIONARIES.en[k as TranslationKey]
      if (!frVal || !frVal.trim()) throw new Error(`Valeur FR vide : ${k}`)
      if (!enVal || !enVal.trim()) throw new Error(`Valeur EN vide : ${k}`)
      // Identiques mais phrase réelle (accentuée ou longue) → probablement non traduit.
      // Les libellés courts sans accent (Agents, Pipeline, Marketplace…) sont
      // légitimement identiques dans les deux langues.
      const looksLikeSentence = /[àâçéèêëîïôùû]/i.test(frVal) || frVal.length > 25
      if (enVal === frVal && looksLikeSentence && !identicalAllowed.has(k)) {
        throw new Error(`Valeur EN identique à FR (non traduite ?) : ${k} = « ${frVal} »`)
      }
    }
  })

  test("interpolation {param} dans les deux langues", () => {
    expect(translate("fr", "live.viewers", { count: 3 })).toBe("3 spectateur(s)")
    expect(translate("en", "live.viewers", { count: 3 })).toBe("3 viewer(s)")
    expect(translate("fr", "dashboard.stats.published", { count: 2 })).toContain("2")
  })

  test("repli français sur clé manquante improbable", () => {
    // translate retombe sur la clé elle-même si absente — comportement défini.
    const bogus = translate("en", "not.a.real.key" as TranslationKey)
    expect(bogus).toBe("not.a.real.key")
  })

  test("couverture des domaines majeurs de navigation", () => {
    for (const key of ["nav.dashboard", "nav.settings", "nav.ads", "nav.billing", "nav.live", "nav.connectors"] as TranslationKey[]) {
      expect(DICTIONARIES.fr[key]).toBeTruthy()
      expect(DICTIONARIES.en[key]).toBeTruthy()
    }
  })
})

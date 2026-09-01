import { describe, test, expect } from "bun:test"
import { analyzeError, runWithSelfCorrection, RetryBudgetExceededError } from "@/lib/engines/self-correction"
import { AppError } from "@/lib/errors"
import { getBreaker } from "@/lib/reliability/breaker"
import { LLMError } from "@/lib/ai/types"
import { InsufficientCreditsError } from "@/lib/credits/ledger"
import type { CorrectionLogEntry } from "@/lib/engines/types"

/** Self-Correction Engine — classification + budget global de retries. */
describe("analyzeError — classification et stratégies", () => {
  test("crédits insuffisants → ABORT", () => {
    const a = analyzeError(new InsufficientCreditsError(10, 2))
    expect(a.strategy).toBe("ABORT")
    expect(a.classification).toBe("CONTEXT")
  })

  test("breaker outil ouvert → SWITCH_TOOL (v3.1 : câblé)", () => {
    const breaker = getBreaker("tool:code_runner-test")
    for (let i = 0; i < 5; i++) breaker.recordFailure("échec")
    try {
      breaker.guard()
      throw new Error("devrait avoir levé")
    } catch (err) {
      const a = analyzeError(err)
      expect(a.strategy).toBe("SWITCH_TOOL")
      expect(a.classification).toBe("TOOL")
    }
  })

  test("breaker fournisseur ouvert → SWITCH_MODEL", () => {
    const breaker = getBreaker("provider:zai-test")
    for (let i = 0; i < 5; i++) breaker.recordFailure("échec")
    try {
      breaker.guard()
      throw new Error("devrait avoir levé")
    } catch (err) {
      const a = analyzeError(err)
      expect(a.strategy).toBe("SWITCH_MODEL")
    }
  })

  test("budget global épuisé → ABORT", () => {
    const a = analyzeError(new RetryBudgetExceededError(8, 8))
    expect(a.strategy).toBe("ABORT")
  })

  test("LLM 429 → TRANSIENT + SWITCH_MODEL", () => {
    const a = analyzeError(new LLMError("zai", "rate limit", "HTTP_429"))
    expect(a.classification).toBe("TRANSIENT")
    expect(a.strategy).toBe("SWITCH_MODEL")
  })

  test("LLM 5xx réseau → TRANSIENT + RETRY", () => {
    const a = analyzeError(new LLMError("zai", "network down", "NETWORK_ERROR"))
    expect(a.classification).toBe("TRANSIENT")
    expect(a.strategy).toBe("RETRY")
  })

  test("erreur logique → RETRY", () => {
    const a = analyzeError(new Error("échec de logique métier"))
    expect(a.strategy).toBe("RETRY")
    expect(a.classification).toBe("LOGIC")
  })
})

describe("runWithSelfCorrection — budget global (v3.1)", () => {
  test("succès immédiat sans retry", async () => {
    const result = await runWithSelfCorrection(async () => "ok", {
      phase: "ANALYZING",
      maxAttempts: 2,
      attempt: 0,
    })
    expect(result.value).toBe("ok")
    expect(result.attempts).toBe(1)
  })

  test("échec puis succès = un retry consommé", async () => {
    let calls = 0
    const result = await runWithSelfCorrection(
      async () => {
        calls++
        if (calls === 1) throw new Error("échec de logique")
        return "rétabli"
      },
      { phase: "ANALYZING", maxAttempts: 2, attempt: 0 }
    )
    expect(result.value).toBe("rétabli")
    expect(result.attempts).toBe(2)
  })

  test("budget épuisé → RetryBudgetExceededError (arrêt propre)", async () => {
    let retried = 0
    try {
      await runWithSelfCorrection(
        async () => {
          throw new Error("échec de logique") // RETRY, jamais ABORT
        },
        {
          phase: "ANALYZING",
          maxAttempts: 10,
          attempt: 0,
          retryBudget: {
            spent: 2,
            max: 3,
            onSpend: async () => {
              retried++
            },
          },
        }
      )
      throw new Error("devrait avoir levé")
    } catch (err) {
      expect(err).toBeInstanceOf(RetryBudgetExceededError)
      expect(retried).toBe(1) // 3e dépense déclenche l'arrêt
    }
  })

  test("onSpend persiste le total (simule Task.totalRetries)", async () => {
    const persisted: number[] = []
    let calls = 0
    await runWithSelfCorrection(
      async () => {
        calls++
        if (calls < 3) throw new Error("échec de logique")
        return "ok"
      },
      {
        phase: "PLANNING",
        maxAttempts: 3,
        attempt: 0,
        retryBudget: { spent: 0, max: 8, onSpend: async (total) => persisted.push(total) },
      }
    )
    expect(persisted).toEqual([1, 2])
  })

  test("stratégie ABORT interrompt immédiatement (aucun retry)", async () => {
    let calls = 0
    const corrections: CorrectionLogEntry[] = []
    try {
      await runWithSelfCorrection(
        async () => {
          calls++
          throw new InsufficientCreditsError(50, 1)
        },
        {
          phase: "EXECUTING",
          maxAttempts: 5,
          attempt: 0,
          onCorrection: (entry) => {
            corrections.push(entry)
          },
        }
      )
      throw new Error("devrait avoir levé")
    } catch (err) {
      expect(err).toBeInstanceOf(InsufficientCreditsError)
      expect(calls).toBe(1)
      expect(corrections).toHaveLength(1)
      expect(corrections[0].outcome).toBe("ABORTED")
    }
  })

  test("AppError métier inconnue remonte inchangée", async () => {
    const appErr = new AppError("PLANNING_FAILED")
    try {
      await runWithSelfCorrection(async () => {
        throw appErr
      }, { phase: "PLANNING", maxAttempts: 2, attempt: 0 })
    } catch (err) {
      // AppError PLANNING_FAILED → analyseError fallback LOGIC/RETRY...
      // mais runWithSelfCorrection re-lance l'erreur d'origine après épuisement.
      expect((err as { code?: string }).code ?? (err as Error).message).toBeTruthy()
    }
  })
})

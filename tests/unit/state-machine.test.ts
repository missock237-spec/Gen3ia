import { describe, test, expect } from "bun:test"
import { canTransition, TASK_STATUSES } from "@/lib/engines/state-machine"

const STATUSES = TASK_STATUSES

/** State machine — transitions strictes du Task Center (v3.1). */
describe("state machine — transitions", () => {
  test("parcours nominal complet", () => {
    expect(canTransition("QUEUED", "ANALYZING")).toBe(true)
    expect(canTransition("ANALYZING", "PLANNING")).toBe(true)
    expect(canTransition("PLANNING", "SIMULATING")).toBe(true)
    expect(canTransition("SIMULATING", "EXECUTING")).toBe(true)
    expect(canTransition("EXECUTING", "VERIFYING")).toBe(true)
    expect(canTransition("VERIFYING", "LEARNING")).toBe(true)
    expect(canTransition("LEARNING", "COMPLETED")).toBe(true)
  })

  test("v3.1 : mode Explain — WAITING_PLAN_APPROVAL", () => {
    expect(canTransition("SIMULATING", "WAITING_PLAN_APPROVAL")).toBe(true)
    expect(canTransition("WAITING_PLAN_APPROVAL", "EXECUTING")).toBe(true)
    expect(canTransition("WAITING_PLAN_APPROVAL", "PLANNING")).toBe(true) // régénération
    expect(canTransition("WAITING_PLAN_APPROVAL", "CANCELLED")).toBe(true)
    // Pas de saut illicite vers VERIFYING/LEARNING.
    expect(canTransition("WAITING_PLAN_APPROVAL", "VERIFYING")).toBe(false)
    expect(canTransition("WAITING_PLAN_APPROVAL", "COMPLETED")).toBe(false)
  })

  test("HITL : WAITING_FOR_HUMAN", () => {
    expect(canTransition("SIMULATING", "WAITING_FOR_HUMAN")).toBe(true)
    expect(canTransition("WAITING_FOR_HUMAN", "EXECUTING")).toBe(true)
    expect(canTransition("WAITING_FOR_HUMAN", "CANCELLED")).toBe(true)
    expect(canTransition("WAITING_FOR_HUMAN", "PLANNING")).toBe(false)
  })

  test("boucles correctives autorisées", () => {
    expect(canTransition("VERIFYING", "EXECUTING")).toBe(true) // correction ciblée
    expect(canTransition("VERIFYING", "PLANNING")).toBe(true) // replan
    expect(canTransition("EXECUTING", "PLANNING")).toBe(true)
  })

  test("états terminaux absorbants", () => {
    for (const terminal of ["COMPLETED", "FAILED", "CANCELLED"]) {
      for (const to of STATUSES) {
        expect(canTransition(terminal, to)).toBe(false)
      }
    }
  })

  test("transitions interdites rejetées", () => {
    expect(canTransition("QUEUED", "EXECUTING")).toBe(false)
    expect(canTransition("ANALYZING", "COMPLETED")).toBe(false)
    expect(canTransition("PLANNING", "VERIFYING")).toBe(false)
  })

  test("WAITING_PLAN_APPROVAL déclaré dans le catalogue", () => {
    expect(TASK_STATUSES).toContain("WAITING_PLAN_APPROVAL")
    expect(TASK_STATUSES).toContain("WAITING_FOR_HUMAN")
    expect(TASK_STATUSES.length).toBe(12)
  })
})

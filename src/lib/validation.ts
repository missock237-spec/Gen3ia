// ============================================================
// VALIDATION ZOD — Schémas de validation pour toutes les routes API
// ============================================================
import { z } from "zod";

// ============================================================
// AUTH
// ============================================================

export const registerSchema = z.object({
  email: z.string().email("Email invalide"),
  password: z.string().min(8, "Minimum 8 caractères").max(100),
  name: z.string().min(2, "Minimum 2 caractères").max(50),
});

export const loginSchema = z.object({
  email: z.string().email("Email invalide"),
  password: z.string().min(1, "Mot de passe requis"),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email("Email invalide"),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1, "Token requis"),
  password: z.string().min(8, "Minimum 8 caractères").max(100),
});

// ============================================================
// AGENTS
// ============================================================

export const createAgentSchema = z.object({
  name: z.string().min(1, "Nom requis").max(100),
  type: z.string().min(1, "Type requis"),
  description: z.string().max(500).default(""),
  config: z.string().default("{}"),
  avatar: z.string().nullable().optional(),
});

export const updateAgentSchema = createAgentSchema.partial();

export const executeAgentSchema = z.object({
  agentId: z.string().min(1, "ID agent requis"),
  input: z.string().min(1, "Message requis").max(10000),
  sessionId: z.string().optional(),
  resume: z.boolean().optional().default(false),
});

// ============================================================
// WORKFLOWS
// ============================================================

export const createWorkflowSchema = z.object({
  name: z.string().min(1, "Nom requis").max(100),
  description: z.string().max(500).default(""),
  steps: z.array(z.object({
    order: z.number().int().min(0),
    agentId: z.string().min(1),
    input: z.string().min(1),
    dependsOn: z.array(z.number().int()).default([]),
  })).min(1, "Au moins une étape requise"),
  triggers: z.array(z.object({
    type: z.enum(["schedule", "webhook", "event"]),
// @ts-ignore — type narrowing pending, see refactor ticket
    config: z.record(z.unknown()),
  })).default([]),
});

// ============================================================
// PAYMENTS (SebPay)
// ============================================================

export const subscribeSchema = z.object({
  planId: z.enum(["free", "starter", "pro", "enterprise"]),
  phone: z.string().regex(/^\+?[1-9]\d{6,14}$/, "Numéro de téléphone invalide"),
  operator: z.enum(["orange", "mtn", "airtel", "moov"]),
  userId: z.string().min(1, "ID utilisateur requis"),
});

// ============================================================
// API KEYS
// ============================================================

export const createApiKeySchema = z.object({
  name: z.string().min(1, "Nom requis").max(50),
  scopes: z.enum(["read", "write", "admin"]).default("read"),
});

// ============================================================
// HELPERS
// ============================================================

export function formatZodErrors(error: z.ZodError): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const path = issue.path.join(".");
    if (!result[path]) result[path] = [];
    result[path]!.push(issue.message);
  }
  return result;
}

// ============================================================
// MULTI-AGENT
// ============================================================

export const multiAgentExecuteSchema = z.object({
  workflowId: z.string().min(1, "ID workflow requis").optional(),
// @ts-ignore — type narrowing pending, see refactor ticket
  inputs: z.record(z.unknown()).optional(),
  priority: z.enum(["low", "normal", "high"]).default("normal"),
  objective: z.string().min(1, "Objectif requis").max(5000),
  agentIds: z.array(z.string()).min(1, "Au moins un agent requis"),
});

// ============================================================
// RAG
// ============================================================

export const ragQuerySchema = z.object({
  query: z.string().min(1, "Requête requise").max(5000),
  topK: z.number().int().min(1).max(100).default(5),
  collectionId: z.string().optional(),
// @ts-ignore — type narrowing pending, see refactor ticket
  filters: z.record(z.unknown()).optional(),
});

// ============================================================
// VALIDATION HELPER
// ============================================================

export function validateBody<T>(schema: z.ZodSchema<T>, data: unknown): { success: true; data: T } | { success: false; errors: Record<string, string[]> } {
  const result = schema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, errors: formatZodErrors(result.error) };
}

// ============================================================
// TYPE INFERENCE
// ============================================================

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type CreateAgentInput = z.infer<typeof createAgentSchema>;
export type ExecuteAgentInput = z.infer<typeof executeAgentSchema>;
export type SubscribeInput = z.infer<typeof subscribeSchema>;
export type MultiAgentExecuteInput = z.infer<typeof multiAgentExecuteSchema>;
export type RagQueryInput = z.infer<typeof ragQuerySchema>;
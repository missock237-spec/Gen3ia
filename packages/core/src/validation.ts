// ============================================================
// Validation — Utilitaire de validation Zod pour les routes API
// ============================================================

import { z, ZodSchema, ZodError } from 'zod';
import { ValidationError } from './errors.js';

/**
 * Valide les donnees d'entree avec un schema Zod
 * Lance ValidationError si la validation echoue
 */
export function validate<T>(schema: ZodSchema<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (result.success) return result.data;

  const formatted = formatZodErrors(result.error);
  throw new ValidationError('Donnees invalides', { fields: formatted });
}

/**
 * Valide le body d'une requete API (JSON)
 */
export async function validateBody<T>(schema: ZodSchema<T>, request: Request): Promise<T> {
  try {
    const body = await request.json();
    return validate(schema, body);
  } catch (e) {
    if (e instanceof ValidationError) throw e;
    throw new ValidationError('Format JSON invalide', { error: String(e) });
  }
}

/**
 * Valide les parametres de requete (query params)
 */
export function validateQuery<T>(schema: ZodSchema<T>, searchParams: URLSearchParams): T {
  const params: Record<string, string> = {};
  searchParams.forEach((value, key) => { params[key] = value; });
  return validate(schema, params);
}

/**
 * Valide les parametres de chemin (route params)
 */
export function validateParams<T>(schema: ZodSchema<T>, params: Record<string, string | undefined>): T {
  return validate(schema, params);
}

/**
 * Formate les erreurs Zod en structure lisible
 */
function formatZodErrors(error: ZodError): Record<string, string[]> {
  return error.errors.reduce((acc, e) => {
    const path = e.path.join('.');
    if (!acc[path]) acc[path] = [];
    acc[path].push(e.message);
    return acc;
  }, {} as Record<string, string[]>);
}

// ============================================================
// Schemas reutilisables pour les routes API
// ============================================================

/** Pagination */
export const PaginationSchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
});

/** ID au format UUID */
export const IdSchema = z.object({
  id: z.string().min(1, 'ID requis'),
});

/** Email */
export const EmailSchema = z.string().email('Email invalide');

/** Agent execution */
export const AgentExecuteSchema = z.object({
  userId: z.string().min(1, 'userId requis'),
  input: z.string().optional(),
  sessionId: z.string().optional(),
});

/** Credits */
export const AddCreditsSchema = z.object({
  userId: z.string().min(1, 'userId requis'),
  amount: z.number().int().positive('Le montant doit etre positif'),
  reason: z.string().min(1, 'Motif requis'),
});

/** Mise a jour de profil */
export const UpdateProfileSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email('Email invalide').optional(),
}).refine(data => data.name || data.email, {
  message: 'Au moins un champ (name ou email) doit etre fourni',
});

/** Webhook Stripe */
export const StripeWebhookSchema = z.object({
  type: z.string(),
  data: z.object({
    object: z.record(z.unknown()),
  }),
});

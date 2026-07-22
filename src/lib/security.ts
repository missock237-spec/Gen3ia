// ============================================================
// SECURITY — Middleware de sécurité pour les routes API
// ============================================================

import { NextRequest, NextResponse } from "next/server";

export interface SecurityContext {
  userId: string;
  role: string;
}

interface SecurityOptions {
  requireAuth?: boolean;
  rateLimit?: { limit: number; windowMs: number };
  roles?: string[];
}

export async function applySecurity(
  request: NextRequest,
  options: SecurityOptions = {}
): Promise<{ auth?: SecurityContext; error?: NextResponse }> {
  const apiKey = request.headers.get("x-api-key");
  const authHeader = request.headers.get("authorization");

  // Vérification par API Key
  if (apiKey) {
    const auth = await authenticateApiKey(apiKey);
    if (auth) {
      return validateRole(auth, options);
    }
  }

  // Vérification par Bearer token
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    const auth = await authenticateToken(token);
    if (auth) {
      return validateRole(auth, options);
    }
  }

  if (options.requireAuth) {
    return { error: NextResponse.json({ error: "Authentification requise" }, { status: 401 }) };
  }

  return { auth: { userId: "anonymous", role: "guest" } };
}

export function secureResponse(response: NextResponse, request: NextRequest): NextResponse {
  const correlationId = request.headers.get("x-correlation-id") ?? crypto.randomUUID();
  response.headers.set("X-Correlation-ID", correlationId);
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  return response;
}

async function authenticateApiKey(apiKey: string): Promise<SecurityContext | null> {
  if (apiKey.length < 16) return null;
  // TODO: vérifier dans la base de données AccessKey
  return { userId: "api-user", role: "api" };
}

async function authenticateToken(token: string): Promise<SecurityContext | null> {
  if (token.length < 20) return null;
  // TODO: vérifier le JWT / session
  return { userId: "session-user", role: "user" };
}

function validateRole(
  auth: SecurityContext,
  options: SecurityOptions
): { auth: SecurityContext; error?: NextResponse } {
  if (options.roles && !options.roles.includes(auth.role)) {
    return {
      auth,
      error: NextResponse.json({ error: "Permissions insuffisantes" }, { status: 403 }),
    };
  }
  return { auth };
}
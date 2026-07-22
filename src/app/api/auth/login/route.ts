import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyPassword, createSession } from "@/lib/auth/auth";
import { SESSION_COOKIE } from "@/lib/auth/auth";
import { loginSchema, validate } from "@/lib/validators";
import { checkLoginAttempts, recordLoginAttempt, slowDown, checkIpRateLimit } from "@/lib/auth/security";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const ip = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "unknown";
    const email = body.email || "";

    const ipCheck = checkIpRateLimit(ip);
    if (!ipCheck.allowed) {
      return NextResponse.json({ error: "Trop de requetes. Reessayez dans une minute." }, { status: 429 });
    }

    const validation = validate(loginSchema, body);
    if (!validation.success) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    const attemptCheck = checkLoginAttempts(email);
    if (!attemptCheck.allowed) {
      const minutesLeft = Math.ceil(((attemptCheck.lockedUntil || 0) - Date.now()) / 60000);
      return NextResponse.json({ error: `Compte bloque. Reessayez dans ${minutesLeft} min.`, locked: true }, { status: 429 });
    }

    await slowDown(email);

    const { password } = validation.data;
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !user.isActive) {
      recordLoginAttempt(email, false, ip);
      await new Promise(r => setTimeout(r, 500));
      return NextResponse.json({ error: "Identifiants invalides" }, { status: 401 });
    }

    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) {
      recordLoginAttempt(email, false, ip);
      await new Promise(r => setTimeout(r, 500));
      return NextResponse.json({ error: "Identifiants invalides" }, { status: 401 });
    }

    recordLoginAttempt(email, true, ip);
    const token = await createSession(user.id);
    const response = NextResponse.json({ user: { id: user.id, email: user.email, name: user.name, role: user.role, plan: user.plan }, token });
    response.cookies.set(SESSION_COOKIE, token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", maxAge: 7 * 24 * 60 * 60, path: "/" });
    return response;
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erreur" }, { status: 500 });
  }
}

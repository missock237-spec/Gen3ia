import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { hashPassword, createSession } from "@/lib/auth/auth";
import { SESSION_COOKIE } from "@/lib/auth/auth";
import { registerSchema, validate } from "@/lib/validators";
import { validatePasswordStrength, checkIpRateLimit } from "@/lib/auth/security";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const ip = request.headers.get("x-forwarded-for") || "unknown";

    const ipCheck = checkIpRateLimit(ip);
    if (!ipCheck.allowed) {
      return NextResponse.json({ error: "Trop de requetes. Reessayez dans une minute." }, { status: 429 });
    }

    const validation = validate(registerSchema, body);
    if (!validation.success) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    const { name, email, password } = validation.data;

    const strengthCheck = validatePasswordStrength(password);
    if (!strengthCheck.valid) {
      return NextResponse.json({ error: "Mot de passe trop faible", details: strengthCheck.errors }, { status: 400 });
    }

    const exists = await prisma.user.findUnique({ where: { email } });
    if (exists) {
      await new Promise(r => setTimeout(r, 1000));
      return NextResponse.json({ error: "Email deja utilise" }, { status: 409 });
    }

    const hashed = await hashPassword(password);
    const user = await prisma.user.create({ data: { name, email, passwordHash: hashed } });

    const token = await createSession(user.id);
    const response = NextResponse.json({ user: { id: user.id, email: user.email, name: user.name, role: "user", plan: "free" }, token }, { status: 201 });
    response.cookies.set(SESSION_COOKIE, token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", maxAge: 7 * 24 * 60 * 60, path: "/" });
    return response;
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erreur" }, { status: 500 });
  }
}

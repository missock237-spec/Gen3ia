import { NextRequest, NextResponse } from "next/server"

/**
 * Middleware central — v3.2 (audit architecture).
 *
 * PROBLÈME : chaque route API protège son propre accès via
 * requireUser()/requireAdmin(). La discipline actuelle est bonne, mais un
 * futur contributeur (ou une fatigue à 2h du matin) peut oublier le garde
 * sur une nouvelle route.
 *
 * SOLUTION : filet de sécurité AU CENTRE. Toute requête vers /api/admin/*
 * sans cookie de session valide est rejetée en 401 AVANT d'atteindre le
 * handler — même si celui-ci a oublié requireAdmin().
 *
 * ⚠ Division des responsabilités ( volontaire ) :
 *  - CE middleware (edge, sans base) : présence/format du cookie → bloque
 *    les non-authentifiés ;
 *  - requireAdmin() (route, en base) : vérifie l'existence de la session
 *    ET le rôle ADMIN → seul garde de vérité.
 * Un utilisateur authentifié non-admin passe donc ici mais est rejeté 403
 * par requireAdmin() sur chaque route admin.
 *
 * NOTE : le nom du cookie est dupliqué volontairement — importer
 * lib/auth/session entraînerait Prisma + node:crypto dans le runtime edge.
 */

const SESSION_COOKIE = "g3ia_session"
const TOKEN_PATTERN = /^[0-9a-f]{64}$/

export function middleware(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value

  if (!token || !TOKEN_PATTERN.test(token)) {
    return NextResponse.json(
      { ok: false, error: "Authentification requise. Connectez-vous.", code: "UNAUTHENTICATED" },
      { status: 401 }
    )
  }

  return NextResponse.next()
}

export const config = {
  // Blocage par préfixe : toute route admin, présente ou future.
  matcher: ["/api/admin/:path*"],
}

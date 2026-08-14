import { NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth';
import { getSecuritySummary } from '@/lib/security/audit-trail';
import { getAgentSecurityStatus } from '@/lib/security/anomaly-detector';
import { getTokenHealth } from '@/lib/oauth/auto-rotate';
import { getEmailConfig } from '@/lib/email/sender';
import { prisma } from '@/lib/prisma';





export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const session = await getServerSession();
    if (!session?.userId) {
      return NextResponse.json({ error: 'Non authentifie' }, { status: 401 });
    }

    const [auditSummary, tokenHealth, emailConfig, user, agents] = await Promise.all([
      getSecuritySummary(session.user.id),
      getTokenHealth(),
      getEmailConfig(),
      prisma.user.findUnique({
        where: { id: session.user.id },
        select: { plan: true, isEmailVerified: true, mfaEnabled: true },
      }),
      prisma.agent.findMany({
        where: { userId: session.user.id, isActive: true },
        select: { id: true, name: true },
      }),
    ]);

    const agentStatuses = await Promise.all(
      agents.map(async (a) => ({
        id: a.id,
        name: a.name,
        security: await getAgentSecurityStatus(a.id),
      }))
    );

    const connectedServices = await prisma.workflowAuthorization.count({
      where: { userId: session.user.id, isActive: true },
    });

    const securityScore = calculateScore(auditSummary, tokenHealth, emailConfig, user);

    return NextResponse.json({
      score: securityScore,
      audit: auditSummary,
      tokens: tokenHealth,
      agents: agentStatuses,
      user: {
        plan: user?.plan || 'free',
        emailVerified: user?.isEmailVerified || false,
        mfaEnabled: user?.mfaEnabled || false,
        connectedServices,
      },
      email: {
        configured: !!emailConfig,
        method: emailConfig ? (emailConfig as {method?: string}).method : null,
      },
      recommendations: getRecommendations(securityScore, user),
    });
  } catch (error) {
    console.error('GET /security/status error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

function calculateScore(
  audit: Awaited<ReturnType<typeof getSecuritySummary>>,
  tokens: Awaited<ReturnType<typeof getTokenHealth>>,
  email: ReturnType<typeof getEmailConfig>,
  user: { plan?: string; isEmailVerified?: boolean; mfaEnabled?: boolean } | null
): { total: number; details: Record<string, number> } {
  let score = 100;
  const details: Record<string, number> = {};

  // Tokens
  if (tokens.expired > 0) { score -= 15; details.tokens = 15; }
  else if (tokens.needsRotation > 0) { score -= 5; details.tokens = 5; }
  else { details.tokens = 0; }

  // Audit
  if (audit.criticals > 0) { score -= 25; details.audit = 25; }
  else if (audit.errors > 5) { score -= 10; details.audit = 10; }
  else { details.audit = 0; }

  // Email
  if (!email) { score -= 10; details.email = 10; }
  else { details.email = 0; }

  // Email verified
  if (!user?.isEmailVerified) { score -= 10; details.emailVerified = 10; }
  else { details.emailVerified = 0; }

  // MFA
  if (!user?.mfaEnabled) { score -= 5; details.mfa = 5; }
  else { details.mfa = 0; }

  // Plan
  if (user?.plan === 'free') { score -= 5; details.plan = 5; }
  else { details.plan = 0; }

  return { total: Math.max(0, score), details };
}

function getRecommendations(
  score: ReturnType<typeof calculateScore>,
  user: { plan?: string; isEmailVerified?: boolean; mfaEnabled?: boolean } | null
): string[] {
  const recs: string[] = [];

  if (score.total < 50) {
    recs.push('Actions urgentes requises pour securiser votre compte');
  }

  if (!user?.isEmailVerified) {
    recs.push('Verifiez votre adresse email pour activer les alertes de securite');
  }
  if (!user?.mfaEnabled) {
    recs.push('Activez l\'authentification a deux facteurs (MFA)');
  }
  if (score.details.tokens && score.details.tokens >= 15) {
    recs.push('Des tokens OAuth sont expires. Reconnectez vos services.');
  }
  if (score.details.tokens && score.details.tokens >= 5 && score.details.tokens < 15) {
    recs.push('Certains tokens necessitent une rotation. La rotation automatique est en cours.');
  }
  if (score.details.email && score.details.email >= 10) {
    recs.push('Configurez un serveur SMTP ou Resend pour recevoir les alertes de securite');
  }
  if (user?.plan === 'free') {
    recs.push('Le plan free a des limites de securite reduites. Passez au plan Pro pour plus de protections.');
  }

  return recs;
}

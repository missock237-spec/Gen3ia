import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from '@/lib/auth';

// 300+ services supportes pour les autorisations de workflows agents IA
export const VALID_SERVICES = [
  // === VERSION CONTROL ===
  'github', 'gitlab', 'bitbucket', 'gitea', 'gogs', 'sourceforge', 'codeberg',
  // === GOOGLE ===
  'google', 'gmail', 'google_calendar', 'google_drive', 'google_photos', 'google_maps',
  'google_analytics', 'google_ads', 'google_cloud', 'google_sheets', 'google_docs',
  'google_slides', 'google_forms', 'google_meet', 'google_chat', 'google_play',
  'google_search_console', 'google_my_business', 'google_tag_manager', 'google_optimize',
  // === MICROSOFT ===
  'microsoft', 'outlook', 'office365', 'microsoft_teams', 'microsoft_sharepoint',
  'microsoft_onedrive', 'microsoft_excel', 'microsoft_word', 'microsoft_powerpoint',
  'microsoft_azure', 'microsoft_dynamics', 'microsoft_power_bi', 'microsoft_power_automate',
  'microsoft_ad', 'microsoft_calendar',
  // === MESSAGERIE ===
  'slack', 'discord', 'telegram', 'whatsapp', 'messenger', 'signal', 'wechat', 'line',
  'viber', 'skype', 'zoom', 'webex', 'gotomeeting',
  // === RESEAUX SOCIAUX ===
  'twitter', 'linkedin', 'instagram', 'facebook', 'tiktok', 'youtube', 'pinterest',
  'reddit', 'twitch', 'tumblr', 'medium', 'devto', 'hashnode', 'substack', 'bluesky',
  'mastodon', 'threads', 'snapchat', 'flickr',
  // === GESTION & PRODUCTIVITE ===
  'notion', 'asana', 'trello', 'jira', 'linear', 'clickup', 'monday', 'wrike',
  'smartsheet', 'basecamp', 'teamwork', 'todoist', 'airtable', 'coda', 'confluence',
  // === E-COMMERCE & PAIEMENT ===
  'shopify', 'woocommerce', 'magento', 'bigcommerce', 'squarespace', 'wix', 'webflow',
  'stripe', 'paypal', 'square', 'braintree', 'chargebee', 'recurly', 'paddle',
  'lemonsqueezy', 'gumroad',
  // === CLOUD & HEBERGEMENT ===
  'aws', 'digitalocean', 'heroku', 'vercel', 'netlify', 'cloudflare', 'fastly',
  'datadog', 'newrelic', 'grafana', 'prometheus', 'sentry', 'logz_io', 'papertrail',
  'elastic_cloud',
  // === CRM ===
  'hubspot', 'salesforce', 'zoho', 'freshsales', 'pipedrive', 'zendesk_sell',
  'close', 'copper', 'nimble', 'insightly',
  // === SUPPORT CLIENT ===
  'zendesk', 'freshdesk', 'intercom', 'helpscout', 'livechat', 'tawkto', 'crisp',
  'drift', 'front', 'kayako',
  // === EMAIL MARKETING ===
  'mailchimp', 'sendgrid', 'mailgun', 'postmark', 'sendinblue', 'customer_io',
  'activecampaign', 'convertkit', 'constant_contact', 'getresponse', 'aweber',
  'campaign_monitor', 'mailercloud',
  // === COMPTABILITE & FINANCE ===
  'stripe_payments', 'paypal_payments', 'quickbooks', 'xero', 'freshbooks', 'wave',
  'sage', 'zoho_books', 'freeagent', 'kashoo',
  // === TELEPHONIE ===
  'twilio', 'vonage', 'plivo', 'telnyx', 'sinch', 'messagebird', 'aws_sns', 'bandwidth',
  // === IA & ML ===
  'openai', 'anthropic', 'huggingface', 'cohere', 'replicate', 'stability_ai',
  'deepgram', 'assemblyai', 'elevenlabs', 'speechify', 'whisper',
  'openrouter', 'perplexity', 'together_ai', 'groq', 'anyscale', 'fireworks_ai', 'lepton_ai',
  'langchain', 'langfuse', 'langsmith', 'wandb', 'mlflow', 'kubeflow',
  // === DATABASES ===
  'supabase', 'firebase', 'neon', 'planetscale', 'mongodb_atlas', 'redis_cloud',
  'couchbase', 'fauna', 'upstash', 'convex', 'neon_db', 'turso', 'xata',
  'cockroachdb', 'timescale',
  // === MONITORING ===
  'datadog_monitoring', 'betterstack', 'uptimerobot', 'pingdom', 'statuspage',
  'incident_io', 'pagerduty', 'opsgenie', 'victorops',
  // === DEVOPS & CI/CD ===
  'docker', 'kubernetes', 'terraform', 'ansible', 'chef', 'puppet', 'jenkins',
  'circleci', 'github_actions', 'gitlab_ci', 'travis_ci', 'teamcity', 'bamboo',
  // === DESIGN ===
  'figma', 'canva', 'adobe_creative_cloud', 'adobe_sign', 'invision', 'sketch', 'zeplin',
  // === MEDIA & MUSIQUE ===
  'spotify', 'apple_music', 'soundcloud', 'deezer', 'tidal', 'shazam',
  // === STOCKAGE ===
  'dropbox', 'box', 'icloud', 'mega', 'pcloud', 'sync',
  // === AUTH ===
  'auth0', 'okta', 'clerk', 'nextauth', 'logto', 'supabase_auth', 'firebase_auth',
  'stytch', 'workos', 'frontegg',
  // === STOCKAGE OBJET ===
  'vercel_blob', 'aws_s3', 'google_cloud_storage', 'cloudinary', 'imgix',
  'uploadthing', 'utfs', 'cloudflare_r2', 'backblaze_b2', 'wasabi', 'minio',
  // === EMAIL TRANSACTIONNEL ===
  'resend', 'sendgrid_email', 'postmark_email', 'mailersend', 'ses',
  // === CALENDRIER ===
  'calendly', 'calcom', 'acuity', 'appointlet', 'youcanbook_me',
  // === FORMULAIRES ===
  'typeform', 'jotform', 'survey_monkey', 'formstack',
  // === ANALYTICS ===
  'hotjar', 'fullstory', 'heap', 'mixpanel', 'amplitude', 'segment',
  'plausible', 'simple_analytics', 'fathom', 'umami', 'matomo',
  // === CARTES ===
  'mapbox', 'mapquest', 'here', 'tomtom',
  // === RECHERCHE ===
  'algolia', 'meilisearch', 'typesense', 'elasticsearch',
  // === QUEUES & TACHES ===
  'qstash', 'inngest', 'trigger_dev', 'bullmq', 'rabbitmq',
  // === HEBERGEMENT ALTERNATIF ===
  'fly_io', 'railway', 'render', 'koyeb', 'cyclic',
  // === OUTILS DEVELOPPEMENT ===
  'imagemagick', 'ffmpeg', 'puppeteer', 'playwright', 'selenium',
  // === GENERATION IA ===
  'dalle', 'midjourney', 'stable_diffusion', 'comfyui', 'flux',
  // === VIDEO IA ===
  'synthesia', 'heygen', 'd_id', 'runwayml', 'pika_labs',
  // === TTS ===
  'elevenlabs_tts', 'google_tts', 'amazon_polly', 'azure_tts', 'cartesia',
] as const;

export type Service = (typeof VALID_SERVICES)[number];

const VALID_SERVICES_SET = new Set<string>(VALID_SERVICES);

interface AuthorizationBody {
  service: string;
  accessToken: string;
  refreshToken?: string;
  accountId: string;
  accountName: string;
  scopes?: string[];
  expiresAt?: string;
}

// GET /api/authorizations - Liste les authorizations de l'utilisateur
export async function GET() {
  try {
    const session = await getServerSession();
    if (!session?.userId) {
      return NextResponse.json({ error: 'Non authorise' }, { status: 401 });
    }

    const authorizations = await prisma.workflowAuthorization.findMany({
      where: { userId: session.userId },
      select: {
        id: true,
        service: true,
        accountId: true,
        accountName: true,
        scopes: true,
        isActive: true,
        lastUsedAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ authorizations });
  } catch (error) {
    console.error('GET /authorizations error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

// POST /api/authorizations - Connecte un nouveau service
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession();
    if (!session?.userId) {
      return NextResponse.json({ error: 'Non authorise' }, { status: 401 });
    }

    const body: AuthorizationBody = await request.json();

    if (!body.service || !VALID_SERVICES_SET.has(body.service)) {
      return NextResponse.json({
        error: 'Service invalide. Consultez la liste des services supportes.'
      }, { status: 400 });
    }

    if (!body.accessToken || !body.accountId || !body.accountName) {
      return NextResponse.json({ error: 'Champs requis manquants' }, { status: 400 });
    }

    // Upsert: cree ou met a jour l authorization existante
    const existing = await prisma.workflowAuthorization.findFirst({
      where: {
        userId: session.userId,
        service: body.service,
        accountId: body.accountId,
      },
    });

    if (existing) {
      const updated = await prisma.workflowAuthorization.update({
        where: { id: existing.id },
        data: {
          accessToken: body.accessToken,
          refreshToken: body.refreshToken ?? null,
          accountName: body.accountName,
          scopes: JSON.stringify(body.scopes ?? []),
          expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
          isActive: true,
        },
      });

      return NextResponse.json({
        authorization: {
          id: updated.id,
          service: updated.service,
          accountId: updated.accountId,
          accountName: updated.accountName,
          scopes: JSON.parse(updated.scopes),
          isActive: updated.isActive,
        },
        message: 'Autorisation mise a jour',
      });
    }

    const authorization = await prisma.workflowAuthorization.create({
      data: {
        userId: session.userId,
        service: body.service,
        accessToken: body.accessToken,
        refreshToken: body.refreshToken ?? null,
        accountId: body.accountId,
        accountName: body.accountName,
        scopes: JSON.stringify(body.scopes ?? []),
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
      },
    });

    return NextResponse.json(
      {
        authorization: {
          id: authorization.id,
          service: authorization.service,
          accountId: authorization.accountId,
          accountName: authorization.accountName,
          scopes: JSON.parse(authorization.scopes),
          isActive: authorization.isActive,
        },
        message: 'Service connecte avec succes',
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('POST /authorizations error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

// DELETE /api/authorizations?service=xxx&accountId=xxx
export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession();
    if (!session?.userId) {
      return NextResponse.json({ error: 'Non authorise' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const service = searchParams.get('service');
    const accountId = searchParams.get('accountId');

    if (!service || !accountId) {
      return NextResponse.json({ error: 'Parametres manquants' }, { status: 400 });
    }

    await prisma.workflowAuthorization.deleteMany({
      where: {
        userId: session.userId,
        service,
        accountId,
      },
    });

    return NextResponse.json({ message: 'Service deconnecte avec succes' });
  } catch (error) {
    console.error('DELETE /authorizations error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

// PATCH /api/authorizations - Rafraichit un token
export async function PATCH(request: NextRequest) {
  try {
    const session = await getServerSession();
    if (!session?.userId) {
      return NextResponse.json({ error: 'Non authorise' }, { status: 401 });
    }

    const body = await request.json();
    const { service, accountId, accessToken, refreshToken } = body;

    if (!service || !accountId) {
      return NextResponse.json({ error: 'Parametres manquants' }, { status: 400 });
    }

    const updateData: Record<string, unknown> = { lastUsedAt: new Date() };
    if (accessToken) updateData.accessToken = accessToken;
    if (refreshToken) updateData.refreshToken = refreshToken;

    await prisma.workflowAuthorization.updateMany({
      where: { userId: session.userId, service, accountId },
      data: updateData,
    });

    return NextResponse.json({ message: 'Token actualise' });
  } catch (error) {
    console.error('PATCH /authorizations error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

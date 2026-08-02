import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth';
import { getAvailableActions, getSupportedServices } from '@/lib/agent-engine/service-executor';
import { prisma } from '@/lib/prisma';





export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession();
    if (!session?.userId) {
      return NextResponse.json({ error: 'Non authentifie' }, { status: 401 });
    }

    const url = new URL(request.url);
    const service = url.searchParams.get('service');

    const connected = await prisma.workflowAuthorization.findMany({
      where: { userId: session.userId, isActive: true },
      select: { service: true, accountName: true },
    });
    const connectedSet = new Set(connected.map(c => c.service));

    if (service) {
      const actions = getAvailableActions(service);
      const isConnected = connectedSet.has(service);
      const account = connected.find(c => c.service === service);

      return NextResponse.json({
        service,
        connected: isConnected,
        accountName: account?.accountName || null,
        totalActions: actions.length,
        actions: actions.map(a => ({
          name: a.name,
          method: a.method,
          description: getActionDescription(service, a.name),
        })),
      });
    }

    const allServices = getSupportedServices();
    const servicesWithStatus = allServices.map(s => ({
      service: s,
      connected: connectedSet.has(s),
      accountName: connected.find(c => c.service === s)?.accountName || null,
      actions: getAvailableActions(s).map(a => ({
        name: a.name,
        method: a.method,
      })),
    }));

    return NextResponse.json({
      total: allServices.length,
      connected: connected.length,
      services: servicesWithStatus,
    });
  } catch (error) {
    console.error('GET /authorizations/services error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

function getActionDescription(service: string, action: string): string {
  const descriptions: Record<string, Record<string, string>> = {
    github: {
      list_repos: 'Lister les depots',
      create_issue: 'Creer un ticket',
      list_issues: 'Lister les tickets',
      create_pr: 'Creer une pull request',
      get_repo: 'Voir les infos d un depot',
      list_commits: 'Lister les commits',
      create_branch: 'Creer une branche',
      create_gist: 'Creer un gist',
      trigger_workflow: 'Declencher un workflow',
    },
    gmail: {
      list_messages: 'Lister les emails',
      get_message: 'Lire un email',
      send_message: 'Envoyer un email',
      search_messages: 'Rechercher des emails',
      create_draft: 'Creer un brouillon',
    },
    slack: {
      list_channels: 'Lister les canaux',
      post_message: 'Envoyer un message',
      get_channel_history: 'Voir l historique',
      list_users: 'Lister les utilisateurs',
      upload_file: 'Uploader un fichier',
    },
    twitter: {
      post_tweet: 'Publier un tweet',
      delete_tweet: 'Supprimer un tweet',
      get_tweet: 'Voir un tweet',
      search_tweets: 'Rechercher des tweets',
      send_dm: 'Envoyer un message direct',
      like_tweet: 'Aimer un tweet',
      follow_user: 'Suivre un utilisateur',
    },
    notion: {
      search: 'Rechercher dans Notion',
      get_page: 'Voir une page',
      create_page: 'Creer une page',
      query_database: 'Interroger une base',
      create_comment: 'Ajouter un commentaire',
    },
    google_calendar: {
      list_events: 'Lister les evenements',
      create_event: 'Creer un evenement',
      update_event: 'Modifier un evenement',
      get_freebusy: 'Verifier les disponibilites',
      quick_add: 'Ajout rapide',
    },
    google_drive: {
      list_files: 'Lister les fichiers',
      get_file: 'Voir un fichier',
      create_file: 'Creer un fichier',
      search_files: 'Rechercher des fichiers',
      export_file: 'Exporter un fichier',
    },
    discord: {
      send_message: 'Envoyer un message',
      get_messages: 'Lire les messages',
      create_dm: 'Creer un DM',
      add_reaction: 'Ajouter une reaction',
    },
    stripe: {
      list_customers: 'Lister les clients',
      list_charges: 'Lister les paiements',
      list_invoices: 'Lister les factures',
      list_products: 'Lister les produits',
      create_customer: 'Creer un client',
    },
  };
  return descriptions[service]?.[action] || `Executer ${action} sur ${service}`;
}

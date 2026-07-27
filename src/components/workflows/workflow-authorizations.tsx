'use client';

import { useState, useEffect } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import {
  Plug,
  Github,
  Mail,
  Slack,
  Chrome,
  Cloud,
  Twitter,
  Linkedin,
  Music,
  Database,
  Trash2,
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Loader2,
} from 'lucide-react';

interface Authorization {
  id: string;
  service: string;
  accountId: string;
  accountName: string;
  scopes: string[];
  isActive: boolean;
  lastUsedAt: string | null;
  createdAt: string;
}

const SERVICE_MAP: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  github: { label: 'GitHub', icon: Github, color: 'text-gray-900 dark:text-white' },
  gitlab: { label: 'GitLab', icon: Cloud, color: 'text-orange-500' },
  google: { label: 'Google', icon: Chrome, color: 'text-blue-500' },
  slack: { label: 'Slack', icon: Slack, color: 'text-purple-500' },
  notion: { label: 'Notion', icon: Database, color: 'text-gray-800 dark:text-gray-200' },
  gmail: { label: 'Gmail', icon: Mail, color: 'text-red-500' },
  google_calendar: { label: 'Google Calendar', icon: Chrome, color: 'text-blue-400' },
  google_drive: { label: 'Google Drive', icon: Cloud, color: 'text-yellow-500' },
  discord: { label: 'Discord', icon: Plug, color: 'text-indigo-500' },
  twitter: { label: 'Twitter / X', icon: Twitter, color: 'text-sky-500' },
  linkedin: { label: 'LinkedIn', icon: Linkedin, color: 'text-blue-600' },
  dropbox: { label: 'Dropbox', icon: Cloud, color: 'text-blue-400' },
  spotify: { label: 'Spotify', icon: Music, color: 'text-green-500' },
  hubspot: { label: 'HubSpot', icon: Plug, color: 'text-orange-400' },
  salesforce: { label: 'Salesforce', icon: Cloud, color: 'text-blue-500' },
};

export default function WorkflowAuthorizations() {
  const [authorizations, setAuthorizations] = useState<Authorization[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [connecting, setConnecting] = useState<string | null>(null);

  useEffect(() => {
    loadAuthorizations();
  }, []);

  const loadAuthorizations = async () => {
    try {
      const res = await fetch('/api/authorizations');
      if (!res.ok) throw new Error('Erreur chargement');
      const data = await res.json();
      setAuthorizations(data.authorizations || []);
    } catch (error) {
      toast.error('Impossible de charger les autorisations');
    } finally {
      setLoading(false);
    }
  };

  const handleDisconnect = async (service: string, accountId: string) => {
    if (!confirm('Voulez-vous vraiment déconnecter ce compte ?')) return;

    setDeletingId(service + accountId);
    try {
      const res = await fetch(
        `/api/authorizations?service=${service}&accountId=${accountId}`,
        { method: 'DELETE' }
      );

      if (!res.ok) throw new Error('Erreur déconnexion');

      toast.success('Compte déconnecté avec succès');
      await loadAuthorizations();
    } catch (error) {
      toast.error('Impossible de déconnecter le compte');
    } finally {
      setDeletingId(null);
    }
  };

  const handleConnect = async (service: string) => {
    setConnecting(service);

    // Simulation OAuth - dans la vraie vie, redirige vers l'URL OAuth du service
    try {
      toast.info(
        `Redirection vers ${SERVICE_MAP[service]?.label || service} pour autorisation...`
      );

      // Ici tu intègres le flux OAuth réel de chaque service
      // window.location.href = `/api/auth/oauth/${service}`;

      // En attendant, on simule une connexion via popup
      await new Promise((r) => setTimeout(r, 1500));

      // Exemple de callback OAuth
      const mockAuth: Authorization = {
        id: crypto.randomUUID(),
        service,
        accountId: `user_${Date.now()}`,
        accountName: `Mon compte ${SERVICE_MAP[service]?.label || service}`,
        scopes: ['read', 'write'],
        isActive: true,
        lastUsedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      };

      const res = await fetch('/api/authorizations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          service: mockAuth.service,
          accessToken: 'mock_token_' + Date.now(),
          accountId: mockAuth.accountId,
          accountName: mockAuth.accountName,
          scopes: mockAuth.scopes,
        }),
      });

      if (!res.ok) throw new Error('Erreur de connexion');

      toast.success(`${SERVICE_MAP[service]?.label || service} connecté avec succès !`);
      await loadAuthorizations();
    } catch (error) {
      toast.error('Impossible de connecter le service');
    } finally {
      setConnecting(null);
    }
  };

  const isConnected = (service: string) =>
    authorizations.some((a) => a.service === service && a.isActive);

  if (loading) {
    return (
      <div className='space-y-4'>
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className='h-20 w-full rounded-xl' />
        ))}
      </div>
    );
  }

  return (
    <div className='space-y-6'>
      <div className='flex items-center justify-between'>
        <div>
          <h2 className='text-2xl font-bold tracking-tight'>
            Connexions & Autorisations
          </h2>
          <p className='text-sm text-muted-foreground'>
            Connecte tes comptes pour permettre aux agents IA d’agir en ton nom
          </p>
        </div>
        <Badge variant='outline' className='text-xs'>
          {authorizations.length} connecté{authorizations.length > 1 ? 's' : ''}
        </Badge>
      </div>

      <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4'>
        {Object.entries(SERVICE_MAP).map(([service, config]) => {
          const connected = isConnected(service);
          const Icon = config.icon;
          const auth = authorizations.find((a) => a.service === service);

          return (
            <Card
              key={service}
              className={`transition-all duration-200 ${
                connected
                  ? 'border-green-500/30 bg-green-500/5'
                  : 'hover:border-primary/50'
              }`}
            >
              <CardHeader className='pb-3'>
                <div className='flex items-center justify-between'>
                  <div className='flex items-center gap-3'>
                    <div className={`p-2 rounded-lg bg-background border ${config.color}`}>
                      <Icon className='h-5 w-5' />
                    </div>
                    <div>
                      <CardTitle className='text-sm font-semibold'>
                        {config.label}
                      </CardTitle>
                      {connected && (
                        <CardDescription className='text-xs mt-0.5'>
                          {auth?.accountName}
                        </CardDescription>
                      )}
                    </div>
                  </div>
                  {connected ? (
                    <CheckCircle2 className='h-5 w-5 text-green-500' />
                  ) : (
                    <Plug className='h-4 w-4 text-muted-foreground' />
                  )}
                </div>
              </CardHeader>

              {connected && auth?.scopes && auth.scopes.length > 0 && (
                <CardContent className='pb-3'>
                  <div className='flex flex-wrap gap-1.5'>
                    {auth.scopes.map((scope: string) => (
                      <Badge key={scope} variant='secondary' className='text-xs'>
                        {scope}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              )}

              <CardFooter className='pt-0'>
                {connected ? (
                  <div className='flex w-full gap-2'>
                    <Button
                      variant='outline'
                      size='sm'
                      className='flex-1 text-xs'
                      onClick={() => handleConnect(service)}
                      disabled={connecting === service}
                    >
                      {connecting === service ? (
                        <Loader2 className='h-3 w-3 mr-1 animate-spin' />
                      ) : (
                        <RefreshCw className='h-3 w-3 mr-1' />
                      )}
                      Rafraîchir
                    </Button>
                    <Button
                      variant='destructive'
                      size='sm'
                      className='flex-1 text-xs'
                      onClick={() => handleDisconnect(service, auth?.accountId || '')}
                      disabled={deletingId === service + (auth?.accountId || '')}
                    >
                      {deletingId === service + (auth?.accountId || '') ? (
                        <Loader2 className='h-3 w-3 mr-1 animate-spin' />
                      ) : (
                        <Trash2 className='h-3 w-3 mr-1' />
                      )}
                      Déconnecter
                    </Button>
                  </div>
                ) : (
                  <Button
                    variant='default'
                    size='sm'
                    className='w-full text-xs'
                    onClick={() => handleConnect(service)}
                    disabled={connecting === service}
                  >
                    {connecting === service ? (
                      <Loader2 className='h-3 w-3 mr-1 animate-spin' />
                    ) : (
                      <Plug className='h-3 w-3 mr-1' />
                    )}
                    Connecter
                  </Button>
                )}
              </CardFooter>
            </Card>
          );
        })}
      </div>

      {authorizations.length > 0 && (
        <Card className='border-muted'>
          <CardHeader>
            <CardTitle className='text-sm'>
              Sessions actives
            </CardTitle>
            <CardDescription className='text-xs'>
              Comptes actuellement autorisés à agir via les agents IA
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className='space-y-3'>
              {authorizations.map((auth) => {
                const config = SERVICE_MAP[auth.service] || {
                  label: auth.service,
                  icon: Plug,
                  color: 'text-muted-foreground',
                };
                const Icon = config.icon;

                return (
                  <div
                    key={auth.id}
                    className='flex items-center justify-between p-3 rounded-lg border bg-card'
                  >
                    <div className='flex items-center gap-3'>
                      <Icon className={`h-4 w-4 ${config.color}`} />
                      <div>
                        <p className='text-sm font-medium'>{config.label}</p>
                        <p className='text-xs text-muted-foreground'>
                          {auth.accountName} &middot;{' '}
                          {auth.lastUsedAt
                            ? new Date(auth.lastUsedAt).toLocaleDateString()
                            : 'Jamais utilisé'}
                        </p>
                      </div>
                    </div>
                    <Badge
                      variant={auth.isActive ? 'default' : 'secondary'}
                      className='text-xs'
                    >
                      {auth.isActive ? 'Actif' : 'Inactif'}
                    </Badge>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

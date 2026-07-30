'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { toast } from 'sonner';
import {
  Bell,
  CheckCircle2,
  XCircle,
  Loader2,
  ExternalLink,
  ShieldAlert,
  Clock,
} from 'lucide-react';

interface ConsentRequest {
  id: string;
  userId: string;
  agentId: string;
  agentName: string;
  service: string;
  action: string;
  description: string;
  params: Record<string, unknown>;
  status: string;
  createdAt: string;
}

const SERVICE_LABELS: Record<string, string> = {
  github: 'GitHub', gmail: 'Gmail', slack: 'Slack', twitter: 'Twitter/X',
  notion: 'Notion', discord: 'Discord', google_calendar: 'Google Calendar',
  google_drive: 'Google Drive', stripe: 'Stripe', dropbox: 'Dropbox',
  linkedin: 'LinkedIn', shopify: 'Shopify',
};

export default function ConsentNotifications() {
  const [requests, setRequests] = useState<ConsentRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    loadRequests();
    const interval = setInterval(loadRequests, 15000);
    return () => clearInterval(interval);
  }, []);

  const loadRequests = async () => {
    try {
      const res = await fetch('/api/approvals');
      if (!res.ok) return;
      const data = await res.json();
      setRequests(data.consents || []);
    } catch {
      // silent fail
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (requestId: string) => {
    setProcessingId(requestId);
    try {
      const res = await fetch('/api/approvals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId, action: 'approve' }),
      });
      if (!res.ok) throw new Error();
      toast.success('Action approuvee');
      await loadRequests();
    } catch {
      toast.error('Erreur approbation');
    } finally {
      setProcessingId(null);
    }
  };

  const handleDeny = async (requestId: string) => {
    setProcessingId(requestId);
    try {
      const res = await fetch('/api/approvals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId, action: 'deny' }),
      });
      if (!res.ok) throw new Error();
      toast.success('Demande refusee');
      await loadRequests();
    } catch {
      toast.error('Erreur refus');
    } finally {
      setProcessingId(null);
    }
  };

  const getActionLabel = (service: string, action: string): string => {
    const labels: Record<string, Record<string, string>> = {
      github: { list_repos: 'Lister depots', create_issue: 'Creer issue', create_pr: 'Creer PR', trigger_workflow: 'Declencher workflow' },
      gmail: { send_message: 'Envoyer email', list_messages: 'Lire emails', create_draft: 'Creer brouillon' },
      slack: { post_message: 'Publier message', list_channels: 'Voir canaux', upload_file: 'Uploader fichier' },
      twitter: { post_tweet: 'Publier tweet', send_dm: 'Envoyer DM', delete_tweet: 'Supprimer tweet' },
      notion: { create_page: 'Creer page', query_database: 'Interroger base', create_comment: 'Commenter' },
    };
    return labels[service]?.[action] || `${action} sur ${SERVICE_LABELS[service] || service}`;
  };

  if (loading) return null;

  return (
    <div className='relative'>
      <button
        onClick={() => setOpen(!open)}
        className='relative p-2 rounded-full hover:bg-accent transition-colors'
      >
        <Bell className='h-5 w-5' />
        {requests.length > 0 && (
          <Badge
            variant='destructive'
            className='absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-[10px]'
          >
            {requests.length > 9 ? '9+' : requests.length}
          </Badge>
        )}
      </button>

      {open && (
        <>
          <div className='fixed inset-0 z-40' onClick={() => setOpen(false)} />
          <Card className='absolute right-0 top-12 z-50 w-96 shadow-xl border'>
            <CardContent className='p-4 max-h-96 overflow-y-auto'>
              <div className='flex items-center justify-between mb-3'>
                <h3 className='text-sm font-semibold flex items-center gap-2'>
                  <ShieldAlert className='h-4 w-4 text-amber-500' />
                  Approbations requises
                </h3>
                <span className='text-xs text-muted-foreground'>
                  {requests.length} en attente
                </span>
              </div>

              {requests.length === 0 ? (
                <p className='text-sm text-muted-foreground text-center py-6'>
                  Aucune demande en attente
                </p>
              ) : (
                <div className='space-y-3'>
                  {requests.map((req) => (
                    <div
                      key={req.id}
                      className='p-3 rounded-lg border bg-card space-y-2'
                    >
                      <div className='flex items-start justify-between'>
                        <div className='flex items-center gap-2'>
                          <Clock className='h-4 w-4 text-amber-500 shrink-0' />
                          <div>
                            <p className='text-sm font-medium'>
                              {req.agentName}
                            </p>
                            <p className='text-xs text-muted-foreground'>
                              {getActionLabel(req.service, req.action)}
                            </p>
                          </div>
                        </div>
                        <Badge variant='outline' className='text-[10px]'>
                          {SERVICE_LABELS[req.service] || req.service}
                        </Badge>
                      </div>

                      {req.description && (
                        <p className='text-xs text-muted-foreground line-clamp-2'>
                          {req.description}
                        </p>
                      )}

                      <div className='flex gap-2 mt-1'>
                        <Button
                          variant='default'
                          size='sm'
                          className='flex-1 h-8 text-xs'
                          onClick={() => handleApprove(req.id)}
                          disabled={processingId === req.id}
                        >
                          {processingId === req.id ? (
                            <Loader2 className='h-3 w-3 animate-spin' />
                          ) : (
                            <CheckCircle2 className='h-3 w-3 mr-1' />
                          )}
                          Approuver
                        </Button>
                        <Button
                          variant='outline'
                          size='sm'
                          className='flex-1 h-8 text-xs'
                          onClick={() => handleDeny(req.id)}
                          disabled={processingId === req.id}
                        >
                          {processingId === req.id ? (
                            <Loader2 className='h-3 w-3 animate-spin' />
                          ) : (
                            <XCircle className='h-3 w-3 mr-1' />
                          )}
                          Refuser
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

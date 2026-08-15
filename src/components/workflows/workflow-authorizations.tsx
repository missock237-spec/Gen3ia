'use client';

import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';
import { Plug, CheckCircle2, Loader2, Search, ChevronDown, ChevronUp, X, Wifi } from 'lucide-react';

interface Authorization { id: string; service: string; accountId: string; accountName: string; scopes: string[]; isActive: boolean; lastUsedAt: string | null; createdAt: string; }

interface ServiceDef { label: string; icon: React.ElementType; color: string; category: string; }

const CATEGORIES: Record<string, { label: string; icon: React.ElementType }> = {
  vcs: { label: 'Version Control', icon: Plug }, google: { label: 'Google', icon: Plug }, microsoft: { label: 'Microsoft', icon: Plug },
  messaging: { label: 'Messagerie', icon: Plug }, social: { label: 'Reseaux', icon: Plug }, productivity: { label: 'Productivite', icon: Plug },
  ecommerce: { label: 'E-commerce', icon: Plug }, cloud: { label: 'Cloud', icon: Plug }, crm: { label: 'CRM', icon: Plug },
  support: { label: 'Support', icon: Plug }, email: { label: 'Email', icon: Plug }, ai: { label: 'IA', icon: Plug },
  database: { label: 'DB', icon: Plug }, devops: { label: 'DevOps', icon: Plug }, design: { label: 'Design', icon: Plug },
  media: { label: 'Media', icon: Plug }, storage: { label: 'Stockage', icon: Plug }, auth: { label: 'Auth', icon: Plug },
};

const SERVICES: Record<string, ServiceDef> = {
  github: { label: 'GitHub', icon: Plug, color: 'text-gray-900', category: 'vcs' },
  google: { label: 'Google', icon: Plug, color: 'text-blue-500', category: 'google' },
  gmail: { label: 'Gmail', icon: Plug, color: 'text-red-500', category: 'google' },
  slack: { label: 'Slack', icon: Plug, color: 'text-purple-500', category: 'messaging' },
  discord: { label: 'Discord', icon: Plug, color: 'text-indigo-500', category: 'messaging' },
  twitter: { label: 'Twitter/X', icon: Plug, color: 'text-sky-500', category: 'social' },
  linkedin: { label: 'LinkedIn', icon: Plug, color: 'text-blue-600', category: 'social' },
  notion: { label: 'Notion', icon: Plug, color: 'text-gray-800', category: 'productivity' },
  stripe: { label: 'Stripe', icon: Plug, color: 'text-blue-500', category: 'ecommerce' },
  shopify: { label: 'Shopify', icon: Plug, color: 'text-green-600', category: 'ecommerce' },
  aws: { label: 'AWS', icon: Plug, color: 'text-orange-400', category: 'cloud' },
  vercel: { label: 'Vercel', icon: Plug, color: 'text-gray-900', category: 'cloud' },
  hubspot: { label: 'HubSpot', icon: Plug, color: 'text-orange-400', category: 'crm' },
  salesforce: { label: 'Salesforce', icon: Plug, color: 'text-blue-500', category: 'crm' },
  openai: { label: 'OpenAI', icon: Plug, color: 'text-green-500', category: 'ai' },
  anthropic: { label: 'Anthropic', icon: Plug, color: 'text-orange-500', category: 'ai' },
  supabase: { label: 'Supabase', icon: Plug, color: 'text-green-500', category: 'database' },
  figma: { label: 'Figma', icon: Plug, color: 'text-purple-500', category: 'design' },
  spotify: { label: 'Spotify', icon: Plug, color: 'text-green-500', category: 'media' },
  dropbox: { label: 'Dropbox', icon: Plug, color: 'text-blue-400', category: 'storage' },
  auth0: { label: 'Auth0', icon: Plug, color: 'text-orange-500', category: 'auth' },
  resend: { label: 'Resend', icon: Plug, color: 'text-gray-800', category: 'email' },
  typeform: { label: 'Typeform', icon: Plug, color: 'text-blue-500', category: 'productivity' },
  algolia: { label: 'Algolia', icon: Plug, color: 'text-blue-500', category: 'productivity' },
  docker: { label: 'Docker', icon: Plug, color: 'text-blue-500', category: 'devops' },
};

export default function WorkflowAuthorizations() {
  const [authorizations, setAuthorizations] = useState<Authorization[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState('all');
  const [expanded, setExpanded] = useState<string | null>(null);

  const loadAuthorizations = async () => {
    try {
      const res = await fetch('/api/authorizations');
      if (!res.ok) throw new Error();
      const data = await res.json();
      setAuthorizations(data.authorizations || []);
    } catch { toast.error('Erreur chargement'); }
    finally { setLoading(false); }
  };

  useEffect(() => { void loadAuthorizations(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const handleConnect = async (service: string) => {
    setConnecting(service);
    window.location.href = '/api/auth/oauth/' + service;
  };

  const handleDisconnect = async (service: string, accountId: string) => {
    setDeletingId(service + accountId);
    try {
      const res = await fetch('/api/authorizations?service=' + service + '&accountId=' + accountId, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      toast.success('Deconnecte');
      await loadAuthorizations();
    } catch { toast.error('Erreur'); }
    finally { setDeletingId(null); }
  };

  const connectedServices = useMemo(() => new Set(authorizations.filter(a => a.isActive).map(a => a.service)), [authorizations]);

  const filteredServices = useMemo(() =>
    Object.entries(SERVICES).filter(([key, config]) => {
      if (!search) return true;
      const q = search.toLowerCase();
      return key.includes(q) || config.label.toLowerCase().includes(q) || (CATEGORIES[config.category]?.label.toLowerCase().includes(q));
    }), [search]);

  const renderCard = (key: string, config: ServiceDef) => {
    const connected = connectedServices.has(key);
    const auth = authorizations.find(a => a.service === key);
    return (
      <Card key={key} className={`transition-all ${connected ? 'border-green-500/30 bg-green-500/5' : 'hover:border-primary/50'}`}>
        <CardContent className='p-2 sm:p-3'>
          <div className='flex items-center justify-between mb-1.5'>
            <div className='flex items-center gap-1.5 min-w-0'>
              <span className={'text-[10px] sm:text-xs p-1 rounded bg-background border shrink-0 ' + config.color}><Plug className='h-3 w-3 sm:h-4 sm:w-4'/></span>
              <span className='text-[11px] sm:text-sm font-medium truncate'>{config.label}</span>
            </div>
            {connected && <CheckCircle2 className='h-3 w-3 sm:h-4 sm:w-4 text-green-500 shrink-0'/>}
          </div>
          {connected ? (
            <div className='flex gap-1'>
              <Button variant='outline' size='sm' className='flex-1 h-6 text-[9px] sm:text-xs' onClick={()=>handleConnect(key)} disabled={connecting===key}>
                {connecting===key ? <Loader2 className='h-2.5 w-2.5 animate-spin'/> : 'Rafraichir'}
              </Button>
              <Button variant='destructive' size='sm' className='flex-1 h-6 text-[9px] sm:text-xs' onClick={()=>handleDisconnect(key, auth?.accountId||'')} disabled={deletingId===key+(auth?.accountId||'')}>
                {deletingId===key+(auth?.accountId||'') ? <Loader2 className='h-2.5 w-2.5 animate-spin'/> : 'Deconnecter'}
              </Button>
            </div>
          ) : (
            <Button variant='default' size='sm' className='w-full h-6 text-[9px] sm:text-xs' onClick={()=>handleConnect(key)} disabled={connecting===key}>
              {connecting===key ? <Loader2 className='h-2.5 w-2.5 mr-1 animate-spin'/> : <Plug className='h-2.5 w-2.5 mr-1'/>}
              Connecter
            </Button>
          )}
        </CardContent>
      </Card>
    );
  };

  if (loading) return <div className='grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2'>{[...Array(12)].map((_,i)=> <Skeleton key={i} className='h-20 sm:h-24 rounded-xl'/>)}</div>;

  return (
    <div className='space-y-3 sm:space-y-4'>
      <div className='flex flex-col sm:flex-row sm:items-center justify-between gap-2'>
        <div>
          <h2 className='text-lg sm:text-2xl font-bold tracking-tight'>Connexions</h2>
          <p className='text-[11px] sm:text-sm text-muted-foreground'>{Object.keys(SERVICES).length} services &middot; {authorizations.length} connecte(s)</p>
        </div>
      </div>

      <div className='relative'>
        <Search className='absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 sm:h-4 sm:w-4 text-muted-foreground'/>
        <Input placeholder='Rechercher...' className='pl-7 sm:pl-9 h-8 sm:h-10 text-xs sm:text-sm' value={search} onChange={e=>setSearch(e.target.value)}/>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <ScrollArea className='w-full pb-1'>
          <TabsList className='inline-flex h-8 sm:h-10'>
            <TabsTrigger value='all' className='text-[10px] sm:text-xs px-2 sm:px-3'>Tous ({Object.keys(SERVICES).length})</TabsTrigger>
            <TabsTrigger value='connected' className='text-[10px] sm:text-xs px-2 sm:px-3'>Connectes ({authorizations.length})</TabsTrigger>
            {Object.entries(CATEGORIES).map(([k,c]) => (
              <TabsTrigger key={k} value={k} className='text-[10px] sm:text-xs px-2 sm:px-3'>{c.label}</TabsTrigger>
            ))}
          </TabsList>
        </ScrollArea>

        <TabsContent value='all' className='mt-2 sm:mt-3'>
          {search ? (
            <div className='grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-1.5 sm:gap-2'>
              {filteredServices.map(([k,c]) => renderCard(k,c))}
            </div>
          ) : (
            <div className='space-y-2 sm:space-y-3'>
              {Object.entries(CATEGORIES).map(([catKey, catInfo]) => {
                const catServices = filteredServices.filter(([,c]) => c.category === catKey);
                if (catServices.length === 0) return null;
                const isExpanded = expanded === catKey;
                const toShow = isExpanded ? catServices : catServices.slice(0, 6);
                return (
                  <div key={catKey} className='space-y-1.5'>
                    <button onClick={()=>setExpanded(isExpanded ? null : catKey)} className='flex items-center gap-1.5 text-[10px] sm:text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors'>
                      <Plug className='h-3 w-3 sm:h-4 sm:w-4'/>{catInfo.label}
                      <span className='text-[9px] sm:text-xs text-muted-foreground'>({catServices.length})</span>
                      {catServices.length > 6 && (isExpanded ? <ChevronUp className='h-3 w-3'/> : <ChevronDown className='h-3 w-3'/>)}
                    </button>
                    <div className='grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-1.5 sm:gap-2'>
                      {toShow.map(([k,c]) => renderCard(k,c))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value='connected' className='mt-2 sm:mt-3'>
          {authorizations.length === 0 ? (
            <p className='text-center text-muted-foreground py-6 text-xs sm:text-sm'>Aucun service connecte</p>
          ) : (
            <div className='grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-1.5 sm:gap-2'>
              {authorizations.filter(a => a.isActive).map(auth => {
                const config = SERVICES[auth.service];
                if (!config) return null;
                return (
                  <Card key={auth.id} className='border-green-500/30 bg-green-500/5'>
                    <CardContent className='p-2 sm:p-3'>
                      <div className='flex items-center justify-between mb-1.5'>
                        <div className='flex items-center gap-1.5 min-w-0'>
                          <Plug className={'h-3 w-3 sm:h-4 sm:w-4 shrink-0 ' + config.color}/>
                          <span className='text-[11px] sm:text-sm font-medium truncate'>{config.label}</span>
                        </div>
                        <CheckCircle2 className='h-3 w-3 sm:h-4 sm:w-4 text-green-500 shrink-0'/>
                      </div>
                      <p className='text-[8px] sm:text-[10px] text-muted-foreground truncate mb-1.5'>{auth.accountName}</p>
                      <Button variant='destructive' size='sm' className='w-full h-6 text-[9px] sm:text-xs' onClick={()=>handleDisconnect(auth.service, auth.accountId)} disabled={deletingId===auth.service+auth.accountId}>
                        {deletingId===auth.service+auth.accountId ? <Loader2 className='h-2.5 w-2.5 animate-spin'/> : 'Deconnecter'}
                      </Button>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

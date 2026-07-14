'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '@/lib/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Key, Plus, Copy, Trash2, CheckCircle2, XCircle, Clock, AlertCircle,
  Loader2, ChevronRight, Shield, Eye, EyeOff, ExternalLink, Sparkles,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface ApiKeyData {
  id: string;
  name: string;
  keyPrefix: string;
  keyLastFour: string;
  scopes: string[];
  rateLimitPerMinute: number;
  lastUsedAt: string | null;
  expiresAt: string | null;
  isActive: boolean;
  createdAt: string;
}

interface ApiKeyStats {
  totalKeys: number;
  activeKeys: number;
  maxKeys: number;
  plan: string;
  rateLimit: number;
  availableScopes: string[];
}

export function ApiKeysManager() {
  const { toast } = useToast();
  const [keys, setKeys] = useState<ApiKeyData[]>([]);
  const [stats, setStats] = useState<ApiKeyStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [creating, setCreating] = useState(false);
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [showPlainKey, setShowPlainKey] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchKeys = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch<{ keys: ApiKeyData[]; stats: ApiKeyStats }>('/api/api-keys');
      setKeys(data.keys);
      setStats(data.stats);
    } catch {
      setKeys([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchKeys();
  }, [fetchKeys]);

  const handleCreate = async () => {
    if (!newKeyName.trim()) return;
    setCreating(true);
    try {
      const result = await apiFetch<{
        success: boolean;
        key: ApiKeyData;
        plainKey: string;
        warning: string;
      }>('/api/api-keys', {
        method: 'POST',
        body: JSON.stringify({ name: newKeyName.trim() }),
      });

      setCreatedKey(result.plainKey);
      setShowPlainKey(true);
      setNewKeyName('');
      fetchKeys();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erreur inconnue';
      toast({ title: 'Erreur', description: msg, variant: 'destructive' });
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async (keyId: string) => {
    setDeletingId(keyId);
    try {
      await apiFetch('/api/api-keys', {
        method: 'DELETE',
        body: JSON.stringify({ keyId }),
      });
      toast({ title: 'Clé révoquée', description: 'La clé API a été désactivée.' });
      fetchKeys();
    } catch {
      toast({ title: 'Erreur', description: 'Impossible de révoquer la clé', variant: 'destructive' });
    } finally {
      setDeletingId(null);
    }
  };

  const handleCopyKey = (key: string) => {
    navigator.clipboard.writeText(key);
    toast({ title: 'Copié !', description: 'Clé API copiée dans le presse-papier' });
  };

  const isFreePlan = stats?.plan === 'free';
  const canCreate = stats ? stats.activeKeys < stats.maxKeys : false;
  const isAtLimit = stats ? stats.activeKeys >= stats.maxKeys : false;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Key className="h-6 w-6 text-primary" />
            Clés API
          </h1>
          <p className="text-muted-foreground mt-1">
            Gérez vos clés d&apos;API pour intégrer Genova dans vos applications.
          </p>
        </div>
        {!isFreePlan && (
          <Button
            onClick={() => setShowCreateDialog(true)}
            disabled={isAtLimit || !canCreate}
            className="gap-2"
          >
            <Plus className="h-4 w-4" />
            Nouvelle clé
          </Button>
        )}
      </div>

      {/* Stats Card */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-6">
            <div className="flex items-center gap-3">
              <Key className="h-5 w-5 text-primary" />
              <div>
                <p className="text-sm text-muted-foreground">Clés actives</p>
                <p className="text-xl font-bold">{stats?.activeKeys ?? 0} / {stats?.maxKeys ?? 0}</p>
              </div>
            </div>
            <Separator orientation="vertical" className="h-10" />
            <div className="flex items-center gap-3">
              <Shield className="h-5 w-5 text-emerald-500" />
              <div>
                <p className="text-sm text-muted-foreground">Plan</p>
                <p className="text-xl font-bold capitalize">{stats?.plan ?? 'free'}</p>
              </div>
            </div>
            <Separator orientation="vertical" className="h-10" />
            <div className="flex items-center gap-3">
              <Clock className="h-5 w-5 text-amber-500" />
              <div>
                <p className="text-sm text-muted-foreground">Rate limit</p>
                <p className="text-xl font-bold">{stats?.rateLimit ?? 0}/min</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Free plan upgrade prompt */}
      {isFreePlan && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="p-6 flex items-start gap-4">
            <Sparkles className="h-6 w-6 text-amber-500 shrink-0 mt-1" />
            <div>
              <h3 className="font-semibold text-lg">Les clés API sont réservées aux plans payants</h3>
              <p className="text-muted-foreground mt-1">
                Passez à Starter (9$/mois), Pro (29$/mois) ou Enterprise (99$/mois)
                pour créer des clés API et intégrer Genova dans vos applications.
              </p>
              <Button className="mt-3 gap-2" variant="default" onClick={() => window.location.href = '/billing'}>
                Voir les offres <ExternalLink className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* At limit warning */}
      {isAtLimit && !isFreePlan && (
        <Card className="border-red-500/30 bg-red-500/5">
          <CardContent className="p-4 flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">Limite de clés atteinte</p>
              <p className="text-sm text-muted-foreground">
                Vous avez atteint la limite de {stats?.maxKeys} clés pour votre plan. 
                Supprimez une clé existante ou passez à un plan supérieur.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Keys List */}
      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : keys.length === 0 && !isFreePlan ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Key className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium">Aucune clé API</h3>
            <p className="text-muted-foreground text-sm">Créez votre première clé pour intégrer Genova.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {keys.map((key) => (
            <Card key={key.id} className={`${!key.isActive ? 'opacity-50' : ''}`}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Key className={`h-4 w-4 ${key.isActive ? 'text-primary' : 'text-muted-foreground'}`} />
                      <span className="font-medium">{key.name}</span>
                      {key.isActive ? (
                        <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 text-[10px]">
                          <CheckCircle2 className="h-3 w-3 mr-0.5" /> Active
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px]">
                          <XCircle className="h-3 w-3 mr-0.5" /> Révoquée
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-4 mt-1.5 text-sm text-muted-foreground">
                      <code className="text-xs bg-muted px-2 py-0.5 rounded font-mono">
                        {key.keyPrefix}...{key.keyLastFour}
                      </code>
                      <span>{key.rateLimitPerMinute} req/min</span>
                      {key.lastUsedAt && (
                        <span>Dernière utilisation: {new Date(key.lastUsedAt).toLocaleDateString()}</span>
                      )}
                    </div>
                    {key.scopes.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {key.scopes.map((scope) => (
                          <Badge key={scope} variant="outline" className="text-[10px]">{scope}</Badge>
                        ))}
                      </div>
                    )}
                  </div>
                  {key.isActive && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-red-500 hover:text-red-600 hover:bg-red-50 shrink-0"
                      onClick={() => handleRevoke(key.id)}
                      disabled={deletingId === key.id}
                    >
                      {deletingId === key.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={(open) => {
        if (!open) {
          setShowCreateDialog(false);
          setCreatedKey(null);
          setShowPlainKey(false);
        }
      }}>
        <DialogContent className="sm:max-w-md">
          {!createdKey ? (
            <>
              <DialogHeader>
                <DialogTitle>Créer une clé API</DialogTitle>
                <DialogDescription>
                  Donnez un nom à votre clé pour la reconnaître facilement.
                  Vous pourrez définir des permissions avancées plus tard.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="grid gap-2">
                  <Label htmlFor="key-name">Nom de la clé</Label>
                  <Input
                    id="key-name"
                    placeholder="Ex: Mon application, CI/CD, ..."
                    value={newKeyName}
                    onChange={(e) => setNewKeyName(e.target.value)}
                    maxLength={64}
                    onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                  />
                  <p className="text-xs text-muted-foreground">
                    {stats ? `${stats.activeKeys}/${stats.maxKeys} clés utilisées` : ''}
                  </p>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
                  Annuler
                </Button>
                <Button
                  onClick={handleCreate}
                  disabled={!newKeyName.trim() || creating}
                  className="gap-2"
                >
                  {creating ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Key className="h-4 w-4" />
                  )}
                  Créer la clé
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-emerald-600">
                  <CheckCircle2 className="h-5 w-5" />
                  Clé créée avec succès !
                </DialogTitle>
                <DialogDescription>
                  Copiez votre clé maintenant. Elle ne sera <strong>plus jamais affichée</strong>.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="relative">
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-muted border font-mono text-sm break-all">
                    {showPlainKey ? createdKey : '•'.repeat(40)}
                  </div>
                  <div className="flex gap-2 mt-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5"
                      onClick={() => setShowPlainKey(!showPlainKey)}
                    >
                      {showPlainKey ? (
                        <><EyeOff className="h-4 w-4" /> Cacher</>
                      ) : (
                        <><Eye className="h-4 w-4" /> Afficher</>
                      )}
                    </Button>
                    <Button
                      size="sm"
                      className="gap-1.5"
                      onClick={() => handleCopyKey(createdKey)}
                    >
                      <Copy className="h-4 w-4" />
                      Copier
                    </Button>
                  </div>
                </div>
                <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 p-3 text-sm">
                  <p className="font-medium text-amber-700 flex items-center gap-1.5">
                    <AlertCircle className="h-4 w-4" />
                    Important
                  </p>
                  <p className="text-amber-600/80 mt-1">
                    Cette clé ne sera plus jamais affichée. Si vous la perdez, vous devrez en créer une nouvelle.
                  </p>
                </div>
              </div>
              <DialogFooter>
                <Button onClick={() => {
                  setShowCreateDialog(false);
                  setCreatedKey(null);
                  setShowPlainKey(false);
                }}>
                  J&apos;ai copié ma clé
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

'use client';

import { useState } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Check, Copy, ExternalLink, Info, Plug, Terminal } from 'lucide-react';

export function MCPConnector() {
  const [copied, setCopied] = useState<string | null>(null);

  const mcpConfig = {
    mcpServers: {
      genova: {
        url: 'https://genova.ai/api/mcp',
        headers: {
          Authorization: 'Bearer votre_cle_api',
        },
      },
    },
  };

  const configJson = JSON.stringify(mcpConfig, null, 2);

  const copyConfig = async () => {
    try {
      await navigator.clipboard.writeText(configJson);
      setCopied('config');
      setTimeout(() => setCopied(null), 2000);
    } catch { /* ignore */ }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plug className="h-5 w-5" />
            Connexion MCP
          </CardTitle>
          <CardDescription>
            Connectez vos outils à Genova via le protocol MCP (Model Context Protocol)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              Compatible avec Cursor, Claude Desktop, Windsurf et tout client MCP.
              Créez d'abord une clé API dans l'onglet "Clés API".
            </AlertDescription>
          </Alert>

          <div className="space-y-2">
            <Label>Configuration MCP</Label>
            <div className="relative">
              <pre className="rounded-lg bg-muted p-4 text-xs font-mono overflow-x-auto">
                <code>{configJson}</code>
              </pre>
              <Button
                size="sm"
                variant="outline"
                className="absolute top-2 right-2"
                onClick={copyConfig}
              >
                {copied === 'config' ? (
                  <Check className="h-4 w-4 text-green-500" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Ou via terminal (npx)</Label>
            <div className="relative">
              <pre className="rounded-lg bg-muted p-4 text-xs font-mono">
                <code>{'npx @genova/mcp-server --api-key votre_cle_api'}</code>
              </pre>
              <Button
                size="sm"
                variant="outline"
                className="absolute top-2 right-2"
                onClick={() => {
                  navigator.clipboard.writeText('npx @genova/mcp-server --api-key votre_cle_api');
                  setCopied('terminal');
                  setTimeout(() => setCopied(null), 2000);
                }}
              >
                {copied === 'terminal' ? (
                  <Check className="h-4 w-4 text-green-500" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4">
            <div className="rounded-lg border p-4">
              <h4 className="font-medium flex items-center gap-2 mb-2">
                <Terminal className="h-4 w-4" />
                Outils disponibles
              </h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li><code>genova_list_agents</code></li>
                <li><code>genova_execute_agent</code></li>
                <li><code>genova_get_credits</code></li>
                <li><code>genova_search_memory</code></li>
              </ul>
            </div>
            <div className="rounded-lg border p-4">
              <h4 className="font-medium flex items-center gap-2 mb-2">
                <Plug className="h-4 w-4" />
                Ressources
              </h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li><code>genova://agents</code></li>
                <li><code>genova://agent/{'{id}'}</code></li>
                <li><code>genova://conversations</code></li>
                <li><code>genova://usage</code></li>
              </ul>
            </div>
            <div className="rounded-lg border p-4">
              <h4 className="font-medium flex items-center gap-2 mb-2">
                <ExternalLink className="h-4 w-4" />
                Intégrations
              </h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>Cursor IDE</li>
                <li>Claude Desktop</li>
                <li>Windsurf</li>
                <li>VS Code (via extension)</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

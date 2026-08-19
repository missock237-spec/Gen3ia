'use client';

import { useState } from 'react';
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Check, Copy, ExternalLink, Info, Plug, Terminal, Loader2 } from 'lucide-react';
import { useAuthStore } from '@/lib/store';

export function MCPConnector() {
  const { user } = useAuthStore();
  const [copied, setCopied] = useState<string | null>(null);
  const [customUrl, setCustomUrl] = useState('');
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://gen3ia.ai';

  const baseConfig = {
    mcpServers: {
      gen3ia: {
        url: customUrl || `${appUrl}/api/mcp`,
        headers: {
          Authorization: `Bearer ${user ? 'votre_cle_api' : ''}`,
        },
      },
    },
  };

  const configJson = JSON.stringify(baseConfig, null, 2);

  const copyConfig = async () => {
    try {
      await navigator.clipboard.writeText(configJson);
      setCopied('config');
      setTimeout(() => setCopied(null), 2000);
    } catch {}
  };

  const copyTerminal = async () => {
    const cmd = `npx @gen3ia/mcp-server --api-key votre_cle_api --endpoint ${appUrl}/api/mcp`;
    await navigator.clipboard.writeText(cmd);
    setCopied('terminal');
    setTimeout(() => setCopied(null), 2000);
  };

  const curlExample = `curl -X POST ${appUrl}/api/mcp \\
  -H "Authorization: Bearer votre_cle_api" \\
  -H "Content-Type: application/json" \\
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/list"
  }'`;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plug className="h-5 w-5" />
            Connexion MCP
          </CardTitle>
          <CardDescription>
            Connectez vos outils à Gen3ia via le protocole MCP (Model Context Protocol)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              Compatible avec <strong>Cursor</strong>, <strong>Claude Desktop</strong>, <strong>Windsurf</strong>, <strong>VS Code</strong> (via extension Continue) et tout client MCP.
              Créez d&apos;abord une clé API dans l&apos;onglet &quot;Clés API&quot;.
            </AlertDescription>
          </Alert>

          <div className="space-y-2">
            <Label htmlFor="mcp-url">URL du serveur MCP (optionnel)</Label>
            <Input
              id="mcp-url"
              placeholder={`${appUrl}/api/mcp`}
              value={customUrl}
              onChange={(e) => setCustomUrl(e.target.value)}
              className="font-mono text-sm"
            />
          </div>

          <div className="space-y-2">
            <Label>Configuration MCP (clients JSON)</Label>
            <div className="relative">
              <pre className="rounded-lg bg-muted p-4 text-xs font-mono overflow-x-auto max-h-48 overflow-y-auto">
                <code>{configJson}</code>
              </pre>
              <Button size="sm" variant="outline" className="absolute top-2 right-2" onClick={copyConfig}>
                {copied === 'config' ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Ou via terminal (npx)</Label>
            <div className="relative">
              <pre className="rounded-lg bg-muted p-4 text-xs font-mono overflow-x-auto">
                <code>{`npx @gen3ia/mcp-server --api-key votre_cle_api --endpoint ${appUrl}/api/mcp`}</code>
              </pre>
              <Button size="sm" variant="outline" className="absolute top-2 right-2" onClick={copyTerminal}>
                {copied === 'terminal' ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Exemple : appel JSON-RPC</Label>
            <pre className="rounded-lg bg-muted p-4 text-xs font-mono overflow-x-auto">
              <code>{curlExample}</code>
            </pre>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4">
            <div className="rounded-lg border p-4">
              <h4 className="font-medium flex items-center gap-2 mb-2">
                <Terminal className="h-4 w-4" />
                Outils disponibles
              </h4>
              <ul className="text-sm text-muted-foreground space-y-1 font-mono">
                <li>gen3ia_list_agents</li>
                <li>gen3ia_execute_agent</li>
                <li>gen3ia_get_credits</li>
                <li>gen3ia_search_memory</li>
                <li>gen3ia_create_agent</li>
              </ul>
            </div>
            <div className="rounded-lg border p-4">
              <h4 className="font-medium flex items-center gap-2 mb-2">
                <Plug className="h-4 w-4" />
                Ressources
              </h4>
              <ul className="text-sm text-muted-foreground space-y-1 font-mono">
                <li>gen3ia://agents</li>
                <li>gen3ia://agent/{'{id}'}</li>
                <li>gen3ia://conversations</li>
                <li>gen3ia://usage</li>
                <li>gen3ia://credits</li>
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
                <li>VS Code (Continue)</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

import { ApiKeysManager } from '@/components/api-keys/api-keys-manager';
import { MCPConnector } from '@/components/connectors/mcp-connector';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Code, Key, Plug } from 'lucide-react';

export const metadata = {
  title: 'Développeurs — Genova AI',
  description: 'Gérez vos clés API et connecteurs MCP',
};

export default function DevelopersPage() {
  return (
    <div className="container mx-auto py-8 px-4 max-w-5xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Développeurs</h1>
        <p className="text-muted-foreground mt-2">
          Intégrez Genova dans vos applications avec l'API REST et les connecteurs MCP.
        </p>
      </div>

      <Tabs defaultValue="api-keys" className="space-y-6">
        <TabsList>
          <TabsTrigger value="api-keys" className="flex items-center gap-2">
            <Key className="h-4 w-4" />
            Clés API
          </TabsTrigger>
          <TabsTrigger value="mcp" className="flex items-center gap-2">
            <Plug className="h-4 w-4" />
            Connecteurs MCP
          </TabsTrigger>
          <TabsTrigger value="docs" className="flex items-center gap-2">
            <Code className="h-4 w-4" />
            Documentation
          </TabsTrigger>
        </TabsList>

        <TabsContent value="api-keys">
          <ApiKeysManager />
        </TabsContent>

        <TabsContent value="mcp">
          <MCPConnector />
        </TabsContent>

        <TabsContent value="docs">
          <div className="prose dark:prose-invert max-w-none">
            <h2>API REST Genova</h2>
            
            <h3>Authentification</h3>
            <p>
              Toutes les requêtes API nécessitent une clé API dans l'en-tête <code>Authorization</code> :
            </p>
            <pre><code>Authorization: Bearer gva_votre_cle_api</code></pre>

            <h3>Endpoints</h3>
            <table>
              <thead>
                <tr>
                  <th>Méthode</th>
                  <th>Endpoint</th>
                  <th>Description</th>
                </tr>
              </thead>
              <tbody>
                <tr><td>GET</td><td><code>/api/keys</code></td><td>Liste des clés API</td></tr>
                <tr><td>POST</td><td><code>/api/keys</code></td><td>Créer une clé API</td></tr>
                <tr><td>DELETE</td><td><code>/api/keys</code></td><td>Révoquer une clé API</td></tr>
                <tr><td>GET</td><td><code>/api/connectors</code></td><td>Liste des connecteurs</td></tr>
                <tr><td>POST</td><td><code>/api/connectors/mcp</code></td><td>Créer un serveur MCP</td></tr>
              </tbody>
            </table>

            <h3>Limites</h3>
            <ul>
              <li><strong>Free</strong> : Pas de clé API</li>
              <li><strong>Starter</strong> : 3 clés, 60 requêtes/min</li>
              <li><strong>Pro</strong> : 10 clés, 300 requêtes/min</li>
              <li><strong>Enterprise</strong> : 50 clés, 1000 requêtes/min</li>
            </ul>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

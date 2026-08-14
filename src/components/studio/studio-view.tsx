'use client';

import { useState } from 'react';
import { Wand2, Settings, Play, Save, Download, Code, Eye, Sparkles, Loader2 } from 'lucide-react';

export function StudioView() {
  const [prompt, setPrompt] = useState('');
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [mode, setMode] = useState<'design' | 'code' | 'preview'>('design');
  const [agentType, setAgentType] = useState('assistant');
  const [temperature, setTemperature] = useState(0.7);

  const generate = async () => {
    if (!prompt.trim()) return;
    setGenerating(true);
    setResult(null);
    
    // Simulation de génération
    setTimeout(() => {
      setResult(`# Agent: ${prompt.slice(0, 30)}...

## Configuration générée
- Type: ${agentType}
- Temperature: ${temperature}
- Modèle: GPT-4

## Prompt système
Tu es un assistant IA spécialisé dans ${prompt}

## Comportement attendu
1. Analyse la requête de l'utilisateur
2. Utilise les outils à disposition
3. Fournis une réponse claire et précise`);
      setGenerating(false);
    }, 1500);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Studio</h1>
          <p className="text-muted-foreground">Créez et configurez vos agents IA</p>
        </div>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-2 px-4 py-2 border border-border rounded-lg text-sm hover:bg-accent transition-colors">
            <Download className="h-4 w-4" />
            Exporter
          </button>
          <button className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors">
            <Save className="h-4 w-4" />
            Enregistrer
          </button>
        </div>
      </div>

      {/* Mode tabs */}
      <div className="flex gap-2 border-b border-border pb-1">
        {[
          { id: 'design' as const, label: 'Design', icon: Wand2 },
          { id: 'code' as const, label: 'Code', icon: Code },
          { id: 'preview' as const, label: 'Aperçu', icon: Eye },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setMode(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 text-sm rounded-t-lg transition-colors ${
              mode === tab.id
                ? 'bg-card border border-border border-b-background text-foreground font-medium -mb-px'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <tab.icon className="h-4 w-4" />
            {tab.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Configuration panel */}
        <div className="lg:col-span-1 space-y-4">
          <div className="bg-card rounded-xl border border-border p-5">
            <h2 className="font-semibold flex items-center gap-2 mb-4">
              <Settings className="h-4 w-4" />
              Configuration
            </h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Type d&apos;agent</label>
                <select
                  value={agentType}
                  onChange={(e) => setAgentType(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                >
                  <option value="assistant">Assistant</option>
                  <option value="support">Support client</option>
                  <option value="marketing">Marketing</option>
                  <option value="research">Recherche</option>
                  <option value="browser">Navigateur</option>
                  <option value="custom">Personnalisé</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">
                  Température: {temperature.toFixed(1)}
                </label>
                <input
                  type="range"
                  min="0"
                  max="2"
                  step="0.1"
                  value={temperature}
                  onChange={(e) => setTemperature(parseFloat(e.target.value))}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-muted-foreground mt-1">
                  <span>Précis</span>
                  <span>Céatif</span>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Instructions</label>
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm min-h-[120px] focus:outline-none focus:ring-2 focus:ring-primary/50"
                  placeholder="Décrivez le comportement de l'agent..."
                />
              </div>

              <button
                onClick={generate}
                disabled={generating || !prompt.trim()}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {generating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                {generating ? 'Génération...' : 'Générer'}
              </button>
            </div>
          </div>

          <div className="bg-card rounded-xl border border-border p-5">
            <h2 className="font-semibold mb-3">Actions rapides</h2>
            <div className="space-y-2">
              <button className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-accent text-sm text-left transition-colors">
                <Play className="h-4 w-4 text-green-500" />
                Tester l&apos;agent
              </button>
              <button className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-accent text-sm text-left transition-colors">
                <Code className="h-4 w-4 text-blue-500" />
                Voir le code généré
              </button>
              <button className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-accent text-sm text-left transition-colors">
                <Download className="h-4 w-4 text-purple-500" />
                Exporter en JSON
              </button>
            </div>
          </div>
        </div>

        {/* Preview panel */}
        <div className="lg:col-span-2">
          <div className="bg-card rounded-xl border border-border p-5 min-h-[400px]">
            <h2 className="font-semibold mb-4 flex items-center gap-2">
              {mode === 'design' && <Wand2 className="h-4 w-4" />}
              {mode === 'code' && <Code className="h-4 w-4" />}
              {mode === 'preview' && <Eye className="h-4 w-4" />}
              {mode === 'design' && 'Aperçu du design'}
              {mode === 'code' && 'Code généré'}
              {mode === 'preview' && 'Aperçu en direct'}
            </h2>

            {!result && !generating && (
              <div className="flex flex-col items-center justify-center h-80 text-center">
                <Wand2 className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium mb-2">Prêt à créer</h3>
                <p className="text-sm text-muted-foreground max-w-md">
                  Configurez votre agent dans le panneau de gauche, puis cliquez sur Générer pour voir le résultat ici.
                </p>
              </div>
            )}

            {generating && (
              <div className="flex flex-col items-center justify-center h-80">
                <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
                <p className="text-sm text-muted-foreground">Génération de l&apos;agent...</p>
              </div>
            )}

            {result && !generating && (
              <div className="space-y-4">
                {mode === 'design' && (
                  <div className="space-y-4">
                    <div className="flex items-center gap-3 p-4 rounded-lg bg-primary/5 border border-primary/20">
                      <Sparkles className="h-5 w-5 text-primary" />
                      <div>
                        <p className="font-medium">Agent configuré avec succès</p>
                        <p className="text-sm text-muted-foreground">{prompt.slice(0, 100)}</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div className="p-3 rounded-lg border border-border">
                        <span className="text-muted-foreground">Type</span>
                        <p className="font-medium capitalize">{agentType}</p>
                      </div>
                      <div className="p-3 rounded-lg border border-border">
                        <span className="text-muted-foreground">Température</span>
                        <p className="font-medium">{temperature.toFixed(1)}</p>
                      </div>
                      <div className="p-3 rounded-lg border border-border">
                        <span className="text-muted-foreground">Modèle</span>
                        <p className="font-medium">GPT-4</p>
                      </div>
                      <div className="p-3 rounded-lg border border-border">
                        <span className="text-muted-foreground">Statut</span>
                        <p className="font-medium text-green-500">Prêt</p>
                      </div>
                    </div>
                  </div>
                )}
                {mode === 'code' && (
                  <pre className="bg-muted rounded-lg p-4 text-sm overflow-x-auto">
                    <code>{result}</code>
                  </pre>
                )}
                {mode === 'preview' && (
                  <div className="rounded-lg border border-border p-6 bg-gradient-to-br from-background to-primary/5">
                    <div className="max-w-md mx-auto text-center">
                      <Sparkles className="h-8 w-8 mx-auto text-primary mb-3" />
                      <h3 className="text-lg font-semibold mb-2">Agent {agentType}</h3>
                      <p className="text-sm text-muted-foreground mb-4">{prompt}</p>
                      <div className="flex justify-center gap-2">
                        <span className="text-xs px-2 py-1 rounded-full bg-primary/10 text-primary">Actif</span>
                        <span className="text-xs px-2 py-1 rounded-full bg-green-500/10 text-green-500">En ligne</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

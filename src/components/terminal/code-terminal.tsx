'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { apiFetch } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Terminal, Play, Square, RotateCcw, Copy, CheckCircle2,
  XCircle, Clock, Loader2, ChevronDown, ChevronRight,
  FileCode, AlertCircle, Coins,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface TerminalSession {
  id: string;
  language: string;
  output: string;
  error: string | null;
  exitCode: number | null;
  status: 'running' | 'completed' | 'error' | 'timeout';
  executionTimeMs: number;
  startedAt: string;
  completedAt: string | null;
}

interface TerminalProps {
  agentId?: string;
  defaultLanguage?: string;
  height?: string;
  minHeight?: string;
  onCodeExecuted?: (result: TerminalSession) => void;
}

const LANGUAGES = [
  { id: 'javascript', label: 'JavaScript', icon: '🟨' },
  { id: 'typescript', label: 'TypeScript', icon: '🔵' },
  { id: 'python', label: 'Python', icon: '🐍' },
  { id: 'bash', label: 'Bash', icon: '🐚' },
  { id: 'html', label: 'HTML', icon: '🌐' },
  { id: 'json', label: 'JSON', icon: '📋' },
];

export function CodeTerminal({
  agentId,
  defaultLanguage = 'javascript',
  height = '400px',
  minHeight = '300px',
  onCodeExecuted,
}: TerminalProps) {
  const { toast } = useToast();
  const [language, setLanguage] = useState(defaultLanguage);
  const [code, setCode] = useState('// Écrivez votre code ici');
  const [output, setOutput] = useState<string[]>(['> Terminal prêt. Choisissez un langage et écrivez du code.']);
  const [executing, setExecuting] = useState(false);
  const [showLanguages, setShowLanguages] = useState(false);
  const [history, setHistory] = useState<TerminalSession[]>([]);
  const [credits, setCredits] = useState(0);
  const outputRef = useRef<HTMLDivElement>(null);
  const codeRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    fetchCredits();
  }, []);

  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [output]);

  const fetchCredits = async () => {
    try {
      const data = await apiFetch<{ balance: number }>('/api/billing/credits');
      setCredits(data.balance);
    } catch {
      // ignore
    }
  };

  const handleExecute = useCallback(async () => {
    if (!code.trim() || executing) return;

    setExecuting(true);
    setOutput((prev) => [...prev, `$ Exécution ${language}...`]);

    try {
      const result = await apiFetch<{
        success: boolean;
        session: TerminalSession;
        creditsUsed: number;
        creditsRemaining: number;
      }>('/api/terminal', {
        method: 'POST',
        body: JSON.stringify({
          language,
          code,
          agentId,
          timeoutMs: 10000,
        }),
      });

      setCredits(result.creditsRemaining);

      const session = result.session;

      if (session.output) {
        setOutput((prev) => [...prev, session.output]);
      }

      if (session.error) {
        setOutput((prev) => [...prev, `❌ ${session.error}`]);
      }

      setOutput((prev) => [
        ...prev,
        `✓ Terminé (${session.executionTimeMs}ms, code: ${session.exitCode}) - 1 crédit utilisé`,
        '',
      ]);

      setHistory((prev) => [session, ...prev].slice(0, 10));
      onCodeExecuted?.(session);

      toast({
        title: session.exitCode === 0 ? '✅ Exécution réussie' : '⚠️ Erreur',
        description: `${session.executionTimeMs}ms • code: ${session.exitCode}`,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erreur';
      setOutput((prev) => [...prev, `❌ Erreur: ${msg}`, '']);
    } finally {
      setExecuting(false);
    }
  }, [code, language, agentId, executing, onCodeExecuted, toast]);

  const handleClear = () => {
    setOutput(['> Terminal réinitialisé']);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      handleExecute();
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      const textarea = e.currentTarget as HTMLTextAreaElement;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      setCode(code.substring(0, start) + '  ' + code.substring(end));
      setTimeout(() => {
        textarea.selectionStart = textarea.selectionEnd = start + 2;
      }, 0);
    }
  };

  const insertSnippet = (snippet: string) => {
    setCode(snippet);
    codeRef.current?.focus();
  };

  return (
    <Card className="overflow-hidden border shadow-sm">
      <CardHeader className="p-3 pb-0 flex flex-row items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Terminal className="h-5 w-5 text-primary" />
          <CardTitle className="text-sm font-semibold">Terminal Code Agent</CardTitle>
          <Badge variant="outline" className="text-[10px] gap-1">
            <Coins className="h-3 w-3" />
            {credits} crédits
          </Badge>
        </div>
        <div className="flex items-center gap-1">
          <div className="relative">
            <Button
              variant="ghost"
              size="sm"
              className="gap-1 text-xs h-7"
              onClick={() => setShowLanguages(!showLanguages)}
            >
              {LANGUAGES.find((l) => l.id === language)?.icon} {language}
              {showLanguages ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            </Button>
            {showLanguages && (
              <div className="absolute top-full left-0 mt-1 bg-popover border rounded-lg shadow-lg z-50 w-40">
                {LANGUAGES.map((lang) => (
                  <button
                    key={lang.id}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors flex items-center gap-2 ${language === lang.id ? 'bg-accent font-medium' : ''}`}
                    onClick={() => { setLanguage(lang.id); setShowLanguages(false); }}
                  >
                    <span>{lang.icon}</span>
                    <span>{lang.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <Button
            size="sm"
            variant={executing ? 'outline' : 'default'}
            className="gap-1 h-7 text-xs"
            onClick={handleExecute}
            disabled={executing || !code.trim()}
          >
            {executing ? (
              <><Loader2 className="h-3 w-3 animate-spin" /> Arrêter</>
            ) : (
              <><Play className="h-3 w-3" /> Exécuter</>
            )}
          </Button>
          <span className="text-[10px] text-muted-foreground hidden sm:inline">Ctrl+Enter</span>
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={handleClear} title="Effacer">
            <RotateCcw className="h-3.5 w-3.5" />
          </Button>
        </div>
      </CardHeader>

      <CardContent className="p-3 space-y-3">
        {/* Éditeur de code */}
        <div className="relative rounded-lg border bg-[#1e1e2e] text-[#cdd6f4] font-mono text-sm">
          {/* Barre d'outils de l'éditeur */}
          <div className="flex items-center gap-1 px-3 py-1.5 border-b border-[#313244] bg-[#181825] rounded-t-lg">
            <div className="flex gap-1.5">
              <div className="w-3 h-3 rounded-full bg-red-500/80" />
              <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
              <div className="w-3 h-3 rounded-full bg-green-500/80" />
            </div>
            <span className="text-[10px] text-[#6c7086] ml-3">{language} • agent intégré</span>
            <div className="ml-auto flex gap-1">
              <button
                className="text-[10px] px-1.5 py-0.5 rounded text-[#6c7086] hover:text-[#cdd6f4] hover:bg-[#313244] transition-colors"
                onClick={() => insertSnippet('console.log("Hello Genova!");')}
                title="Snippet: Hello"
              >
                Hello
              </button>
              <button
                className="text-[10px] px-1.5 py-0.5 rounded text-[#6c7086] hover:text-[#cdd6f4] hover:bg-[#313244] transition-colors"
                onClick={() => insertSnippet('const data = [1, 2, 3].map(n => n * 2);\nconsole.log(data);')}
                title="Snippet: Map"
              >
                Map
              </button>
              <button
                className="text-[10px] px-1.5 py-0.5 rounded text-[#6c7086] hover:text-[#cdd6f4] hover:bg-[#313244] transition-colors"
                onClick={() => insertSnippet('const fetchData = async () => {\n  try {\n    const res = await fetch("https://api.example.com/data");\n    const data = await res.json();\n    console.log(data);\n  } catch (e) {\n    console.error(e);\n  }\n};\nfetchData();')}
                title="Snippet: Fetch"
              >
                Fetch
              </button>
            </div>
          </div>
          <textarea
            ref={codeRef}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={handleKeyDown}
            className="w-full bg-transparent text-[#cdd6f4] p-3 font-mono text-sm resize-none focus:outline-none"
            style={{ minHeight: '120px', height: 'auto', lineHeight: '1.6' }}
            spellCheck={false}
            placeholder="// Écrivez votre code ici..."
          />
        </div>

        {/* Sortie / Terminal */}
        <div
          ref={outputRef}
          className="rounded-lg border bg-[#1e1e2e] text-[#a6adc8] font-mono text-xs overflow-y-auto p-3"
          style={{ height: '160px', minHeight: '100px' }}
        >
          {output.length === 0 ? (
            <div className="text-[#585b70] italic">> Terminal prêt. Exécutez du code pour voir la sortie.</div>
          ) : (
            output.map((line, i) => (
              <div key={i} className={`whitespace-pre-wrap break-all ${
                line.startsWith('❌') ? 'text-red-400' :
                line.startsWith('✓') ? 'text-green-400' :
                line.startsWith('$') ? 'text-[#89b4fa]' :
                line.startsWith('>') ? 'text-[#585b70]' :
                'text-[#a6adc8]'
              }`}>
                {line}
              </div>
            ))
          )}
        </div>

        {/* Stats */}
        {history.length > 0 && (
          <>
            <Separator />
            <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
              <span className="flex items-center gap-1">
                <FileCode className="h-3 w-3" />
                {history.length} exécutions
              </span>
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {history[0]?.executionTimeMs}ms dernière
              </span>
              <span className="flex items-center gap-1">
                <Coins className="h-3 w-3" />
                1 crédit/exécution
              </span>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

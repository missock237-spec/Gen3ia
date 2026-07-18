'use client';

import { useState, useRef, useEffect, useCallback } from 'react';

interface OutputLine {
  type: 'info' | 'success' | 'error' | 'warn' | 'system' | 'result';
  message: string;
}

interface ExecutionStats {
  duration: number;
  tokens: number;
  success: boolean;
  lines: number;
  features: string[];
}

const DEMOS: Record<string, string> = {
  hello: `// Les bases : variables, boucles, fonctions
const app = "Genova";
let version = 3;

function greet(name: string): string {
  return \`👋 Bonjour \${name}!\`;
}

console.log(greet("Love Rose"));
console.log(app, "v" + version);`,

  arrays: `// Manipulation de tableaux
const data = [12, 5, 8, 130, 44, 9];

const doubles = data.map(n => n * 2);
console.log("×2:", doubles);

const filtered = data.filter(n => n > 20);
console.log(">20:", filtered);

const sum = data.reduce((a, b) => a + b, 0);
console.log("Somme:", sum);`,

  api: `// Simulation d'appel API
async function fetchData() {
  console.log("🔄 Chargement...");
  await new Promise(r => setTimeout(r, 300));
  return { users: ["Alice", "Bob"], total: 2 };
}

const result = await fetchData();
console.log("📦 Données:", result);`,

  saas: `// Pipeline SaaS Genova
async function pipeline() {
  console.log("1️⃣ Auth..."); await sleep(150);
  console.log("2️⃣ Credits..."); await sleep(100);
  console.log("3️⃣ IA..."); await sleep(200);
  console.log("4️⃣ Sauvegarde..."); await sleep(100);
  console.log("\n✅ Pipeline termine!");
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
await pipeline();`,
};

export default function CodeStudio() {
  const [code, setCode] = useState(DEMOS.hello);
  const [output, setOutput] = useState<OutputLine[]>([]);
  const [stats, setStats] = useState<ExecutionStats | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [activeDemo, setActiveDemo] = useState('hello');
  const [activeTab, setActiveTab] = useState<'editor' | 'preview'>('editor');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const outputRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [output]);

  const addOutput = useCallback((type: OutputLine['type'], message: string) => {
    setOutput(prev => [...prev, { type, message }]);
  }, []);

  const runCode = useCallback(async () => {
    setIsRunning(true);
    setOutput([]);
    setStats(null);

    const t0 = performance.now();
    const logs: string[] = [];
    const features: string[] = [];

    // Détection des features
    if (/=>/.test(code)) features.push('Arrow functions');
    if (/async|await/.test(code)) features.push('Async/Await');
    if (/class\s+/.test(code)) features.push('Classes');
    if (/\.map\(|\.filter\(|\.reduce\(/.test(code)) features.push('Array methods');
    if (/for\s*\(|while\s*\(/.test(code)) features.push('Loops');
    if (/function\s+/.test(code)) features.push('Functions');

    const origLog = console.log;
    const origError = console.error;

    console.log = (...args: unknown[]) => {
      const msg = args.map(a => String(a)).join(' ');
      logs.push(msg);
    };
    console.error = (...args: unknown[]) => {
      const msg = '❌ ' + args.map(a => String(a)).join(' ');
      logs.push(msg);
    };

    try {
      const fn = new Function('return (async () => { ' + code + ' })();');
      const result = await fn();

      const duration = Math.round(performance.now() - t0);

      if (logs.length === 0) {
        addOutput('result', '→ ' + (result !== undefined ? JSON.stringify(result, null, 2) : 'undefined'));
      } else {
        logs.forEach(log => {
          const type: OutputLine['type'] = log.startsWith('❌') ? 'error' : log.startsWith('⚠') ? 'warn' : 'info';
          addOutput(type, log);
        });
      }

      if (result !== undefined && logs.length > 0) {
        addOutput('result', '→ ' + (typeof result === 'object' ? JSON.stringify(result, null, 2) : String(result)));
      }

      addOutput('success', '✅ Execute en ' + duration + 'ms');

      setStats({
        duration,
        tokens: Math.round(code.length / 4),
        success: true,
        lines: code.split('\n').length,
        features,
      });
    } catch (err: unknown) {
      const duration = Math.round(performance.now() - t0);
      const msg = err instanceof Error ? err.message : String(err);
      addOutput('error', '❌ Erreur: ' + msg);
      setStats({ duration, tokens: 0, success: false, lines: code.split('\n').length, features });
    } finally {
      console.log = origLog;
      console.error = origError;
      setIsRunning(false);
    }
  }, [code, addOutput]);

  const loadDemo = useCallback((name: string) => {
    setActiveDemo(name);
    setCode(DEMOS[name] || DEMOS.hello);
    setOutput([]);
    setStats(null);
  }, []);

  const clearOutput = useCallback(() => {
    setOutput([]);
    setStats(null);
  }, []);

  const lineCount = code.split('\n').length;

  return (
    <div className="flex flex-col gap-4 h-full">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold">◈ CodeStudio</h2>
          <p className="text-sm text-muted-foreground">
            Execute et teste du code JavaScript en direct
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={runCode}
            disabled={isRunning}
            className="px-4 py-2 rounded-lg bg-primary text-primary-foreground font-medium text-sm hover:opacity-90 disabled:opacity-50 transition-all"
          >
            {isRunning ? '⏳ Execution...' : '▶ Executer'}
          </button>
          <button
            onClick={clearOutput}
            className="px-3 py-2 rounded-lg border border-border text-sm hover:bg-accent transition-colors"
          >
            Effacer
          </button>
        </div>
      </div>

      {/* Onglets demos */}
      <div className="flex gap-1.5 flex-wrap">
        {Object.keys(DEMOS).map(name => (
          <button
            key={name}
            onClick={() => loadDemo(name)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              activeDemo === name
                ? 'bg-primary text-primary-foreground'
                : 'bg-card border border-border hover:bg-accent'
            }`}
          >
            {name === 'hello' ? 'Hello' :
             name === 'arrays' ? 'Arrays' :
             name === 'api' ? 'API Sim' :
             name === 'saas' ? 'SaaS' : name}
          </button>
        ))}
      </div>

      {/* Grille editeur / sortie */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 flex-1 min-h-0">
        {/* Editeur */}
        <div className="flex flex-col rounded-xl border border-border bg-card overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-muted/50">
            <span className="text-xs font-medium text-muted-foreground">
              📝 Code source ({lineCount} lignes)
            </span>
            <span className="text-xs text-muted-foreground">
              JavaScript
            </span>
          </div>
          <div className="flex flex-1 min-h-0">
            <div className="py-3 px-2 text-right text-xs text-muted-foreground/50 select-none bg-muted/20 font-mono leading-6 overflow-hidden">
              {Array.from({ length: lineCount }, (_, i) => (
                <div key={i}>{i + 1}</div>
              ))}
            </div>
            <textarea
              ref={textareaRef}
              value={code}
              onChange={e => setCode(e.target.value)}
              className="flex-1 p-3 bg-background text-foreground font-mono text-sm leading-6 resize-none border-none outline-none focus:ring-1 focus:ring-primary/30"
              spellCheck={false}
              placeholder="Ecris ton code ici..."
            />
          </div>
        </div>

        {/* Sortie */}
        <div className="flex flex-col rounded-xl border border-border bg-card overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-muted/50">
            <span className="text-xs font-medium text-muted-foreground">
              🖥️ Console
            </span>
            {stats && (
              <span className="text-xs text-muted-foreground">
                {stats.duration}ms · {stats.tokens} tokens
              </span>
            )}
          </div>
          <div
            ref={outputRef}
            className="flex-1 p-4 font-mono text-sm leading-6 overflow-auto bg-[#1e1e2e] text-[#cdd6f4] min-h-[200px]"
          >
            {output.length === 0 ? (
              <div className="text-[#585b70] italic">
                {isRunning ? '⏳ Execution en cours...' : '▶ Execute du code pour voir le resultat'}
              </div>
            ) : (
              output.map((line, i) => (
                <div
                  key={i}
                  className={`whitespace-pre-wrap ${
                    line.type === 'error' ? 'text-[#f38ba8]' :
                    line.type === 'success' ? 'text-[#a6e3a1]' :
                    line.type === 'warn' ? 'text-[#f9e2af]' :
                    line.type === 'result' ? 'text-[#cba6f7]' :
                    line.type === 'system' ? 'text-[#585b70] italic' :
                    'text-[#89b4fa]'
                  }`}
                >
                  {line.message}
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Statistiques */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="rounded-xl border border-border bg-card p-3">
            <div className="text-xs text-muted-foreground mb-0.5">Duree</div>
            <div className="text-lg font-bold text-primary">{stats.duration}ms</div>
          </div>
          <div className="rounded-xl border border-border bg-card p-3">
            <div className="text-xs text-muted-foreground mb-0.5">Lignes</div>
            <div className="text-lg font-bold text-primary">{stats.lines}</div>
          </div>
          <div className="rounded-xl border border-border bg-card p-3">
            <div className="text-xs text-muted-foreground mb-0.5">Tokens</div>
            <div className="text-lg font-bold text-primary">{stats.tokens}</div>
          </div>
          <div className="rounded-xl border border-border bg-card p-3">
            <div className="text-xs text-muted-foreground mb-0.5">Statut</div>
            <div className={`text-lg font-bold ${stats.success ? 'text-green-500' : 'text-red-500'}`}>
              {stats.success ? 'Reussi' : 'Echec'}
            </div>
          </div>
          {stats.features.length > 0 && (
            <div className="col-span-full rounded-xl border border-border bg-card p-3">
              <div className="text-xs text-muted-foreground mb-1.5">Fonctionnalites detectees</div>
              <div className="flex gap-1.5 flex-wrap">
                {stats.features.map((f, i) => (
                  <span key={i} className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-medium">
                    {f}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
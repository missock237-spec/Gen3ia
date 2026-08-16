'use client';
import { useState, useRef, useEffect } from 'react';
import { Terminal, Loader2 } from 'lucide-react';

export function TerminalView() {
  const [cmds, setCmds] = useState<{i:string;o:string;e?:boolean}[]>([{i:'gen3ia --version',o:'Gen3ia v1.0.0'}]);
  const [input, setInput] = useState('');
  const [exec, setExec] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => { ref.current?.scrollIntoView(); }, [cmds]);

  const run = () => {
    if (!input.trim() || exec) return;
    setExec(true);
    const c = input;
    setInput('');
    setTimeout(() => {
      if (c === 'help') {
        setCmds(p => [...p, { i: c, o: 'help, status, agents, clear, date, whoami, pwd, ls' }]);
      } else if (c === 'clear') {
        setCmds([]);
      } else if (c === 'status') {
        setCmds(p => [...p, { i: c, o: 'CPU: 12% RAM: 245MB Agents: 3 actifs' }]);
      } else if (c === 'agents') {
        setCmds(p => [...p, { i: c, o: 'Agent-1 (support) [actif]\nAgent-2 (code) [actif]\nAgent-3 (data) [en veille]' }]);
      } else if (c === 'date') {
        setCmds(p => [...p, { i: c, o: new Date().toLocaleString('fr-FR') }]);
      } else {
        setCmds(p => [...p, { i: c, o: 'Commande envoyee au terminal intelligent...', e: true }]);
      }
      setExec(false);
    }, 200);
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Terminal</h1>
        <p className="text-muted-foreground">Console interactive Gen3ia</p>
      </div>
      <div className="bg-black text-green-400 rounded-xl border p-4 font-mono text-sm min-h-[400px] overflow-y-auto">
        <div className="mb-4 pb-2 border-b border-green-900/50 text-xs">Gen3ia Terminal — tapez help pour les commandes</div>
        {cmds.map((c, i) => (
          <div key={i} className="mb-2">
            <div className="flex gap-2">
              <span className="text-green-600">$</span>
              <span className="text-white">{c.i}</span>
            </div>
            <div className={`ml-4 mt-1 ${c.e ? 'text-red-400' : 'text-green-400/80'}`}>{c.o}</div>
          </div>
        ))}
        <div className="flex items-center gap-2 mt-4">
          <span className="text-green-600">$</span>
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') run(); }}
            className="flex-1 bg-transparent border-none outline-none text-white"
            placeholder="cmd..."
            disabled={exec}
          />
          {exec && <Loader2 className="w-4 h-4 animate-spin" />}
        </div>
        <div ref={ref} />
      </div>
    </div>
  );
}

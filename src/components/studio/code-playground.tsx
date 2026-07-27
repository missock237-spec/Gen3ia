'use client';
import { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { Play, Copy, RotateCcw, Terminal, Monitor, Clock, Code, FileCode, Loader2, Trash2 } from 'lucide-react';

const LANGUAGE_OPTIONS = [
  { value: 'javascript', label: 'JavaScript', icon: FileCode },
  { value: 'typescript', label: 'TypeScript', icon: Code },
  { value: 'html', label: 'HTML', icon: Code },
  { value: 'css', label: 'CSS', icon: Code },
  { value: 'jsx', label: 'React JSX', icon: FileCode },
  { value: 'tsx', label: 'React TSX', icon: FileCode },
];

const SNIPPETS: Record<string, string> = {
  javascript: '// Exemple JavaScript\nfunction fibonacci(n) {\n  if (n <= 1) return n;\n  return fibonacci(n - 1) + fibonacci(n - 2);\n}\nconsole.log("Fibonacci(10) =", fibonacci(10));\nconsole.log("Date:", new Date().toLocaleDateString());',
  typescript: '// Exemple TypeScript\ninterface User { id: number; name: string; }\nfunction greet(u: User): string {\n  return "Bonjour " + u.name + "!";\n}\nconst user: User = { id: 1, name: "Genova" };\nconsole.log(greet(user));',
  html: '<h1>Hello Genova!</h1>\n<p>Rendu HTML en direct.</p>\n<button onclick="alert('Clique!')">Cliquez</button>\n<style>\n  body { font-family: sans-serif; padding: 20px; }\n  h1 { color: #6c5ce7; }\n  button { padding: 8px 16px; background: #6c5ce7; color: white; border: none; border-radius: 4px; cursor: pointer; }\n</style>',
  css: '/* Exemple CSS */\nbody { background: linear-gradient(135deg, #667eea, #764ba2); display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; }\n.card { background: white; border-radius: 16px; padding: 32px; box-shadow: 0 20px 60px rgba(0,0,0,0.3); }\nh1 { color: #333; font-family: sans-serif; text-align: center; }',
  jsx: 'const App = () => {\n  const [count, setCount] = React.useState(0);\n  return (\n    <div style={{textAlign:"center",padding:40,fontFamily:"sans-serif"}}>\n      <h1 style={{color:"#6c5ce7"}}>Compteur: {count}</h1>\n      <button onClick={() => setCount(c=>c+1)}>+</button>\n      <button onClick={() => setCount(c=>c-1)}>-</button>\n    </div>\n  );\n};\nReactDOM.createRoot(document.getElementById("root")).render(React.createElement(App));',
  tsx: 'interface Props { name: string; count: number; }\nconst App: React.FC<Props> = ({ name, count }) => {\n  return (\n    <div style={{textAlign:"center",padding:40,fontFamily:"sans-serif"}}>\n      <h1 style={{color:"#6c5ce7"}}>Bonjour {name}!</h1>\n      <p>Compteur: {count}</p>\n    </div>\n  );\n};\nReactDOM.createRoot(document.getElementById("root")).render(React.createElement(App, { name: "Genova", count: 42 }));',
};

export default function CodePlayground() {
  const [code, setCode] = useState(SNIPPETS.javascript);
  const [language, setLanguage] = useState('javascript');
  const [output, setOutput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [executing, setExecuting] = useState(false);
  const [executionTime, setExecutionTime] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState('output');
  const [history, setHistory] = useState<Array<{code:string;output:string;language:string;time:number}>>([]);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    setCode(SNIPPETS[language] || SNIPPETS.javascript);
    setOutput(''); setError(null); setExecutionTime(null);
  }, [language]);

  const executeCode = useCallback(async () => {
    setExecuting(true); setError(null); setOutput('');
    if (['html','css','jsx','tsx'].includes(language)) {
      try {
        const res = await fetch('/api/code/execute', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code, language }),
        });
        const data = await res.json();
        if (data.success && data.output) {
          const blob = new Blob([data.output], { type: 'text/html' });
          if (iframeRef.current) iframeRef.current.src = URL.createObjectURL(blob);
          setOutput('Rendu HTML dans Visualisation');
        } else setError(data.error || 'Erreur');
        if (data.executionTime) setExecutionTime(data.executionTime);
      } catch (err) { setError('Erreur: ' + (err instanceof Error ? err.message : '?')); }
      finally { setExecuting(false); }
      return;
    }
    try {
      const start = performance.now();
      const logs: string[] = [];
      const c = { log: (...a:unknown[])=>logs.push(a.map(String).join(' ')), error: (...a:unknown[])=>logs.push('[ERR] '+a.map(String).join(' ')) };
      let execCode = code;
      if (language === 'typescript') execCode = code.replace(/:\s*\w+/g,'').replace(/interface\s+\w+\s*{[^}]*}/g,'');
      const fn = new Function('console', execCode);
      fn(c);
      const elapsed = performance.now() - start;
      setOutput(logs.join('\n') || 'Succes (aucun output)');
      setExecutionTime(elapsed);
      setHistory(p => [{code,output:logs.join('\n'),language,time:elapsed},...p].slice(0,10));
    } catch (err) { setError('Erreur: ' + (err instanceof Error ? err.message : '?')); }
    finally { setExecuting(false); }
  }, [code, language]);

  return (
    <div className='space-y-4'>
      <div className='flex items-center justify-between flex-wrap gap-2'>
        <div className='flex items-center gap-2'>
          <h2 className='text-xl font-bold'>Studio Code</h2>
          <div className='flex gap-1 flex-wrap'>
            {LANGUAGE_OPTIONS.map(o => (
              <Button key={o.value} variant={language===o.value?'default':'outline'} size='sm' className='h-7 text-xs' onClick={()=>setLanguage(o.value)}>
                {o.label}
              </Button>
            ))}
          </div>
        </div>
        <div className='flex items-center gap-2'>
          {executionTime!==null && <Badge variant='outline' className='text-xs'><Clock className='h-3 w-3 mr-1'/>{executionTime.toFixed(0)}ms</Badge>}
          <Button variant='outline' size='sm' className='h-8 text-xs' onClick={()=>{setOutput('');setError(null);if(iframeRef.current)iframeRef.current.src='about:blank';}}>
            <Trash2 className='h-3 w-3 mr-1'/>Effacer
          </Button>
          <Button variant='outline' size='sm' className='h-8 text-xs' onClick={()=>{navigator.clipboard.writeText(code);toast.success('Copie');}}>
            <Copy className='h-3 w-3 mr-1'/>Copier
          </Button>
          <Button size='sm' className='h-8' onClick={executeCode} disabled={executing}>
            {executing ? <Loader2 className='h-3 w-3 mr-1 animate-spin'/> : <Play className='h-3 w-3 mr-1'/>}
            Executer
          </Button>
        </div>
      </div>

      <div className='grid grid-cols-1 lg:grid-cols-2 gap-4'>
        <Card>
          <CardHeader className='pb-2 px-4 pt-3'>
            <CardTitle className='text-sm flex items-center gap-2'>
              <Code className='h-4 w-4'/>Editeur
              <Badge variant='secondary' className='text-[10px] ml-auto'>{language.toUpperCase()}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className='p-0'>
            <Textarea value={code} onChange={e=>setCode(e.target.value)}
              onKeyDown={e=>{if((e.ctrlKey||e.metaKey)&&e.key==='Enter'){e.preventDefault();executeCode();}}}
              className='font-mono text-sm min-h-[400px] rounded-none border-0 resize-y focus-visible:ring-0'
              placeholder='Ecrivez votre code...'/>
          </CardContent>
        </Card>

        <div className='space-y-4'>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className='w-full'>
              <TabsTrigger value='output' className='flex-1 text-xs'><Terminal className='h-3 w-3 mr-1'/>Console</TabsTrigger>
              <TabsTrigger value='preview' className='flex-1 text-xs'><Monitor className='h-3 w-3 mr-1'/>Visualisation</TabsTrigger>
              <TabsTrigger value='history' className='flex-1 text-xs'><Clock className='h-3 w-3 mr-1'/>Historique</TabsTrigger>
            </TabsList>

            <TabsContent value='output'>
              <Card><CardContent className='p-0'>
                <pre className='font-mono text-sm p-4 min-h-[360px] max-h-[500px] overflow-auto bg-black/5 dark:bg-white/5 rounded-lg'>
                  {error ? <span className='text-red-500'>{error}</span> : output || <span className='text-muted-foreground'>Executer pour voir le resultat...</span>}
                </pre>
              </CardContent></Card>
            </TabsContent>

            <TabsContent value='preview'>
              <Card><CardContent className='p-0'>
                <iframe ref={iframeRef} className='w-full min-h-[360px] rounded-lg border-0' src='about:blank' sandbox='allow-scripts allow-modals' title='Preview'/>
              </CardContent></Card>
            </TabsContent>

            <TabsContent value='history'>
              <Card><CardContent className='p-3 max-h-[400px] overflow-y-auto'>
                {history.length===0 ? <p className='text-sm text-muted-foreground text-center py-8'>Aucune execution</p>
                : <div className='space-y-2'>{history.map((item,i)=>(
                  <div key={i} className='p-2 rounded-lg border bg-card text-xs cursor-pointer hover:bg-accent' onClick={()=>{setCode(item.code);setLanguage(item.language);}}>
                    <div className='flex items-center justify-between mb-1'>
                      <Badge variant='secondary' className='text-[10px]'>{item.language}</Badge>
                      <span className='text-muted-foreground'>{item.time.toFixed(0)}ms</span>
                    </div>
                    <pre className='line-clamp-2 font-mono text-[10px] text-muted-foreground'>{item.code.slice(0,100)}{item.code.length>100?'...':''}</pre>
                  </div>
                ))}</div>}
              </CardContent></Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>

      <div className='flex items-center justify-between'>
        <p className='text-xs text-muted-foreground'>Ctrl+Enter pour executer &middot; {code.length} caracteres</p>
        {history.length>0 && <Button variant='ghost' size='sm' className='h-7 text-xs' onClick={()=>setHistory([])}><RotateCcw className='h-3 w-3 mr-1'/>Reset</Button>}
      </div>
    </div>
  );
}

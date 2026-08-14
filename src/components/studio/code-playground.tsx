'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import {
  Play, Terminal, Monitor, Clock, Code, FileCode,
  Loader2, Save, FolderOpen, Plus, Download, Share2, File,
  Files, X, AlertCircle, Menu, ChevronDown,
} from 'lucide-react';

interface CodeFile { name: string; content: string; language: string; }
interface CodeProject { id?: string; name: string; language: string; files: CodeFile[]; fileCount?: number; updatedAt?: string; }

const FILE_ICONS: Record<string, React.ElementType> = { js: FileCode, ts: Code, jsx: FileCode, tsx: Code, html: Code, css: Code, json: File, py: FileCode };

const PROJECT_TEMPLATES: Record<string, CodeProject> = {
  blank: { name: 'Vierge', language: 'javascript', files: [{ name: 'index.js', content: '// Projet vierge\nconsole.log("Bonjour Genova!");', language: 'javascript' }] },
  'hello-react': { name: 'Hello React', language: 'jsx', files: [
    { name: 'App.jsx', content: 'import React, { useState } from "react";\nconst App = () => {\n  const [count, setCount] = useState(0);\n  return (\n    <div style={{padding:40,fontFamily:"sans-serif",textAlign:"center"}}>\n      <h1 style={{color:"#6c5ce7"}}>Hello Genova!</h1>\n      <p>Compteur: {count}</p>\n      <button onClick={()=>setCount(c=>c+1)}>+</button>\n      <button onClick={()=>setCount(c=>c-1)}>-</button>\n    </div>\n  );\n};', language: 'jsx' },
    { name: 'style.css', content: 'body { margin: 0; background: linear-gradient(135deg, #667eea, #764ba2); min-height: 100vh; display: flex; justify-content: center; align-items: center; }', language: 'css' },
  ] },
  'snake-game': { name: 'Snake Game', language: 'html', files: [
    { name: 'snake.html', content: '<!DOCTYPE html><html><head><style>body{margin:0;display:flex;justify-content:center;min-height:100vh;background:#1a1a2e}canvas{border:2px solid #6c5ce7;background:#16213e}.score{color:#fff;font-size:24px;text-align:center;padding:16px}button{padding:8px 24px;background:#6c5ce7;color:#fff;border:none;border-radius:6px;cursor:pointer}</style></head><body><div><div class="score">Score: <span id="score">0</span></div><canvas id="game" width="400" height="400"></canvas><div style="text-align:center;padding:12px"><button onclick="init()">Nouvelle partie</button></div></div><script>const canvas=document.getElementById("game"),ctx=canvas.getContext("2d"),scale=20;let snake,direction,food,score,gameLoop;function init(){snake=[{x:10,y:10}],direction={x:0,y:0},score=0,food={x:Math.floor(Math.random()*20),y:Math.floor(Math.random()*20)},clearInterval(gameLoop),gameLoop=setInterval(update,150)}function update(){snake.unshift({x:snake[0].x+direction.x,y:snake[0].y+direction.y});if(snake[0].x===food.x&&snake[0].y===food.y){score++;document.getElementById("score").textContent=score;food={x:Math.floor(Math.random()*20),y:Math.floor(Math.random()*20)}}else snake.pop();if(snake[0].x<0||snake[0].x>=20||snake[0].y<0||snake[0].y>=20){clearInterval(gameLoop);return}for(let i=1;i<snake.length;i++){if(snake[i].x===snake[0].x&&snake[i].y===snake[0].y){clearInterval(gameLoop);return}}draw()}function draw(){ctx.fillStyle="#16213e";ctx.fillRect(0,0,400,400);ctx.fillStyle="#6c5ce7";snake.forEach(p=>ctx.fillRect(p.x*scale,p.y*scale,scale-2,scale-2));ctx.fillStyle="#ff6b6b";ctx.beginPath();ctx.arc(food.x*scale+scale/2,food.y*scale+scale/2,scale/2-2,0,Math.PI*2);ctx.fill()}document.addEventListener("keydown",e=>{switch(e.key){case"ArrowUp":if(direction.y!==0)break;direction={x:0,y:-1};break;case"ArrowDown":if(direction.y!==0)break;direction={x:0,y:1};break;case"ArrowLeft":if(direction.x!==0)break;direction={x:-1,y:0};break;case"ArrowRight":if(direction.x!==0)break;direction={x:1,y:0};break}});init();</script></body></html>', language: 'html' },
  ] },
  'todo-app': { name: 'Todo App', language: 'jsx', files: [
    { name: 'App.jsx', content: 'import React, { useState } from "react";\nexport default function TodoApp() {\n  const [todos, setTodos] = useState([{id:1,text:"Apprendre Genova",done:true},{id:2,text:"Creer agent",done:false}]);\n  const [input, setInput] = useState("");\n  const addTodo = () => { if(!input.trim()) return; setTodos([...todos,{id:Date.now(),text:input,done:false}]); setInput(""); };\n  return (\n    <div style={{maxWidth:400,margin:"20px auto",fontFamily:"sans-serif"}}>\n      <h1 style={{color:"#6c5ce7"}}>Todo App</h1>\n      <div style={{display:"flex",gap:8}}>\n        <input value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addTodo()} placeholder="Nouvelle tache..." />\n        <button onClick={addTodo}>Ajouter</button>\n      </div>\n      {todos.map(t => (\n        <div key={t.id} style={{display:"flex",alignItems:"center",gap:8,padding:"8px",borderBottom:"1px solid #eee"}}>\n          <input type="checkbox" checked={t.done} readOnly />\n          <span style={{flex:1,textDecoration:t.done?"line-through":"none"}}>{t.text}</span>\n        </div>\n      ))} \n    </div>\n  );\n}', language: 'jsx' },
  ] },
  '3d-scene': { name: 'Scene 3D', language: 'html', files: [
    { name: 'scene.html', content: '<!DOCTYPE html><html><head><script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script><style>body{margin:0;overflow:hidden}canvas{display:block}</style></head><body><script>const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(75,window.innerWidth/window.innerHeight,0.1,1000),renderer=new THREE.WebGLRenderer({antialias:true});renderer.setSize(window.innerWidth,window.innerHeight),document.body.appendChild(renderer.domElement);const geo=new THREE.TorusKnotGeometry(1,0.3,128,16),mat=new THREE.MeshStandardMaterial({color:0x6c5ce7,metalness:0.8,roughness:0.2}),mesh=new THREE.Mesh(geo,mat);scene.add(mesh);const light1=new THREE.PointLight(0x6c5ce7,1,10);light1.position.set(2,2,2),scene.add(light1);const light2=new THREE.PointLight(0x00cec9,1,10);light2.position.set(-2,-2,2),scene.add(light2);camera.position.z=4;function animate(){requestAnimationFrame(animate),mesh.rotation.x+=0.01,mesh.rotation.y+=0.02,renderer.render(scene,camera)}animate();</script></body></html>', language: 'html' },
  ] },
};

export default function CodePlayground() {
  const [project, setProject] = useState<CodeProject>(PROJECT_TEMPLATES['blank']);
  const [activeFile, setActiveFile] = useState(0);
  const [output, setOutput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [executing, setExecuting] = useState(false);
  const [executionTime, setExecutionTime] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState('output');
  const [history, setHistory] = useState<Array<{project:string;output:string;time:number}>>([]);
  const [savedProjects, setSavedProjects] = useState<Array<{id:string;name:string;language:string;updatedAt:string}>>([]);
  const [showTemplates, setShowTemplates] = useState(false);
  const [showProjects, setShowProjects] = useState(false);
  const [projectName, setProjectName] = useState('Mon Projet');
  const [saving, setSaving] = useState(false);
  const [showNewFile, setShowNewFile] = useState(false);
  const [newFileName, setNewFileName] = useState('');
  const [isMobile, setIsMobile] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 1024);
    check();
    window.addEventListener('resize', check);
    loadSavedProjects();
    return () => window.removeEventListener('resize', check);
  }, []);

  const loadSavedProjects = async () => {
    try { const res = await fetch('/api/code/projects'); if (res.ok) { const data = await res.json(); setSavedProjects(data.projects || []); } } catch {}
  };

  const currentFile = project.files[activeFile];
  const language = currentFile?.language || 'javascript';

  const updateFile = (content: string) => {
    const files = [...project.files];
    files[activeFile] = { ...files[activeFile], content };
    setProject({ ...project, files, language: files[activeFile].language });
  };

  const addFile = () => {
    if (!newFileName.trim()) return;
    const ext = newFileName.split('.').pop() || 'js';
    const langMap: Record<string,string> = { js:'javascript', ts:'typescript', tsx:'tsx', jsx:'jsx', html:'html', css:'css', py:'python' };
    const lang = langMap[ext] || 'javascript';
    const files = [...project.files, { name: newFileName.trim(), content: '', language: lang }];
    setProject({ ...project, files });
    setActiveFile(files.length - 1); setShowNewFile(false); setNewFileName('');
  };

  const removeFile = (index: number) => {
    if (project.files.length <= 1) return;
    const files = project.files.filter((_, i) => i !== index);
    setProject({ ...project, files });
    if (activeFile >= files.length) setActiveFile(files.length - 1);
  };

  const loadTemplate = (key: string) => {
    const tpl = PROJECT_TEMPLATES[key];
    if (tpl) { setProject(JSON.parse(JSON.stringify(tpl))); setActiveFile(0); setOutput(''); setError(null); setProjectName(tpl.name); setShowTemplates(false); }
  };

  const saveProject = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/code/projects', {
        method: project.id ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: project.id, name: projectName, language, files: project.files }),
      });
      if (res.ok) { toast.success('Projet sauvegarde !'); loadSavedProjects(); }
    } catch { toast.error('Erreur'); } finally { setSaving(false); }
  };

  const shareProject = async () => {
    try {
      const b64 = btoa(unescape(encodeURIComponent(JSON.stringify(project.files))));
      await navigator.clipboard.writeText(window.location.origin + '/studio/code?shared=' + b64);
      toast.success('Lien copie !');
    } catch { toast.error('Erreur partage'); }
  };

  const executeCode = useCallback(async () => {
    setExecuting(true); setError(null); setOutput('');
    const mainFile = currentFile;
    if (!mainFile) { setExecuting(false); return; }

    if (['html','css','jsx','tsx'].includes(mainFile.language)) {
      try {
        const htmlFile = project.files.find(f => f.language === 'html');
        const cssFile = project.files.find(f => f.language === 'css');
        const jsxFile = project.files.find(f => ['jsx','tsx'].includes(f.language));
        let fullHtml = htmlFile?.content || '';
        if (!fullHtml.includes('<!DOCTYPE')) {
          fullHtml = '<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>' + (cssFile?.content || '') + '</style></head><body>' +
            (fullHtml || '<div id="root"></div>') +
            '<script src="https://unpkg.com/react@18/umd/react.production.min.js"></script>' +
            '<script src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>' +
            '<script>' + (jsxFile?.content || '') + '</script></body></html>';
        }
        const blob = new Blob([fullHtml], { type: 'text/html' });
        if (iframeRef.current) iframeRef.current.src = URL.createObjectURL(blob);
        setOutput('Rendu dans Preview');
      } catch (err) { setError('Erreur: ' + (err instanceof Error ? err.message : '?')); }
      finally { setExecuting(false); }
      return;
    }

    try {
      const start = performance.now();
      const logs: string[] = [];
      const c = { log: (...a:unknown[])=>logs.push(a.map(String).join(' ')), error: (...a:unknown[])=>logs.push('[ERR] '+a.map(String).join(' ')) };
      let code = mainFile.content;
      if (mainFile.language === 'typescript') code = code.replace(/:\s*\w+/g,'').replace(/interface\s+\w+\s*{[^}]*}/g,'');
      new Function('console', code)(c);
      const elapsed = performance.now() - start;
      setOutput(logs.join('\n') || 'Succes');
      setExecutionTime(elapsed);
      setHistory(p => [{project:projectName,output:logs.join('\n'),time:elapsed},...p].slice(0,10));
    } catch (err) { setError('Erreur: ' + (err instanceof Error ? err.message : '?')); }
    finally { setExecuting(false); }
  }, [currentFile, project.files, projectName]);

  const FileIcon = FILE_ICONS[currentFile?.name?.split('.').pop() || ''] || FileCode;

  // Version mobile empilee, version desktop cote a cote
  return (
    <div className='space-y-3 px-0 sm:px-1'>
      {/* HEADER responsive */}
      <div className='flex flex-col sm:flex-row sm:items-center justify-between gap-2'>
        <div className='flex items-center gap-2'>
          <h2 className='text-lg sm:text-xl font-bold truncate max-w-[140px] sm:max-w-[200px]'>{projectName}</h2>
          <div className='hidden sm:flex gap-1'>
            <Button variant='ghost' size='sm' className='h-7 text-xs px-2' onClick={()=>setShowTemplates(!showTemplates)}><FolderOpen className='h-3 w-3 mr-1'/>Templates</Button>
            <Button variant='ghost' size='sm' className='h-7 text-xs px-2' onClick={()=>setShowProjects(!showProjects)}><Files className='h-3 w-3 mr-1'/>Projets</Button>
          </div>
          <div className='sm:hidden'>
            <Button variant='ghost' size='sm' className='h-7 w-7 p-0' onClick={()=>setShowMobileMenu(!showMobileMenu)}><Menu className='h-4 w-4'/></Button>
          </div>
        </div>
        <div className='flex items-center gap-1 flex-wrap'>
          {executionTime!==null && <Badge variant='outline' className='text-[10px] h-5'><Clock className='h-2.5 w-2.5 mr-1'/>{executionTime.toFixed(0)}ms</Badge>}
          <div className='hidden sm:flex gap-1'>
            <Button variant='ghost' size='sm' className='h-8 text-xs px-2' onClick={shareProject}><Share2 className='h-3 w-3 mr-1'/>Partager</Button>
            <Button variant='outline' size='sm' className='h-8 text-xs px-2' onClick={saveProject} disabled={saving}>{saving ? <Loader2 className='h-3 w-3 animate-spin'/> : <Save className='h-3 w-3 mr-1'/>}Sauver</Button>
          </div>
          <Button size='sm' className='h-8 text-xs px-3' onClick={executeCode} disabled={executing}>
            {executing ? <Loader2 className='h-3 w-3 mr-1 animate-spin'/> : <Play className='h-3 w-3 mr-1'/>}
            {isMobile ? '' : 'Executer'}
          </Button>
        </div>
      </div>

      {/* Menu mobile */}
      {showMobileMenu && (
        <Card className='border-primary/20'>
          <CardContent className='p-2 flex flex-wrap gap-1'>
            <Button variant='ghost' size='sm' className='h-8 text-xs' onClick={()=>{setShowTemplates(!showTemplates);setShowMobileMenu(false);}}><FolderOpen className='h-3 w-3 mr-1'/>Templates</Button>
            <Button variant='ghost' size='sm' className='h-8 text-xs' onClick={()=>{setShowProjects(!showProjects);setShowMobileMenu(false);}}><Files className='h-3 w-3 mr-1'/>Projets</Button>
            <Button variant='ghost' size='sm' className='h-8 text-xs' onClick={shareProject}><Share2 className='h-3 w-3 mr-1'/>Partager</Button>
            <Button variant='outline' size='sm' className='h-8 text-xs' onClick={saveProject} disabled={saving}>{saving ? <Loader2 className='h-3 w-3 animate-spin'/> : <Save className='h-3 w-3 mr-1'/>}Sauver</Button>
          </CardContent>
        </Card>
      )}

      {/* Templates & Projets */}
      {showTemplates && (
        <Card className='border-primary/20'>
          <CardContent className='p-2 sm:p-3'>
            <div className='flex items-center justify-between mb-2'><span className='text-xs sm:text-sm font-semibold'>Templates</span><Button variant='ghost' size='sm' className='h-6 w-6 p-0' onClick={()=>setShowTemplates(false)}><X className='h-3 w-3'/></Button></div>
            <div className='grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-1.5'>
              {Object.entries(PROJECT_TEMPLATES).map(([k, t]) => (
                <Button key={k} variant='outline' size='sm' className='h-9 text-[10px] sm:text-xs justify-start px-2' onClick={()=>loadTemplate(k)}><FileCode className='h-3 w-3 mr-1.5 shrink-0'/><span className='truncate'>{t.name}</span></Button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {showProjects && (
        <Card className='border-primary/20'>
          <CardContent className='p-2 sm:p-3'>
            <div className='flex items-center justify-between mb-2'><span className='text-xs sm:text-sm font-semibold'>Projets ({savedProjects.length})</span><Button variant='ghost' size='sm' className='h-6 w-6 p-0' onClick={()=>setShowProjects(false)}><X className='h-3 w-3'/></Button></div>
            {savedProjects.length === 0 ? <p className='text-xs text-muted-foreground'>Aucun projet</p> : (
              <div className='grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-1.5'>
                {savedProjects.map(p => (
                  <Button key={p.id} variant='outline' size='sm' className='h-8 text-[10px] sm:text-xs justify-start px-2' onClick={()=>{/* load */ setShowProjects(false)}}>
                    <FileCode className='h-3 w-3 mr-1.5 shrink-0'/><span className='truncate'>{p.name}</span>
                  </Button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Onglets fichiers - scroll horizontal */}
      <div className='flex items-center gap-0.5 overflow-x-auto pb-0.5 scrollbar-thin'>
        {project.files.map((f, i) => {
          const EI = FILE_ICONS[f.name?.split('.').pop() || ''] || FileCode;
          return (
            <div key={i} className={`flex items-center gap-1 px-1.5 sm:px-2.5 py-1 sm:py-1.5 text-[10px] sm:text-xs rounded-t cursor-pointer border-b-2 whitespace-nowrap transition-colors shrink-0 ${i===activeFile ? 'border-primary bg-accent font-medium' : 'border-transparent hover:bg-accent/50'}`} onClick={()=>setActiveFile(i)}>
              <EI className='h-2.5 w-2.5 sm:h-3 sm:w-3'/>
              <span className='max-w-[60px] sm:max-w-[100px] truncate'>{f.name}</span>
              {project.files.length > 1 && <button onClick={e=>{e.stopPropagation();removeFile(i);}} className='ml-0.5 text-muted-foreground hover:text-destructive'><X className='h-2.5 w-2.5'/></button>}
            </div>
          );
        })}
        <Button variant='ghost' size='sm' className='h-6 w-6 sm:h-7 sm:w-7 p-0 ml-1 shrink-0' onClick={()=>setShowNewFile(!showNewFile)}><Plus className='h-3 w-3'/></Button>
      </div>

      {showNewFile && (
        <div className='flex items-center gap-1.5'>
          <Input value={newFileName} onChange={e=>setNewFileName(e.target.value)} placeholder='fichier.tsx' className='h-7 text-xs' onKeyDown={e=>e.key==='Enter'&&addFile()}/>
          <Button size='sm' className='h-7 text-xs px-2' onClick={addFile}><Plus className='h-3 w-3 mr-1'/>Ok</Button>
        </div>
      )}

      {/* Editeur + Output - Responsive */}
      <div className='flex flex-col lg:flex-row gap-3'>
        {/* Editeur */}
        <div className='flex-1 min-w-0'>
          <Card>
            <CardHeader className='pb-1 px-2 sm:px-4 pt-2'>
              <CardTitle className='text-[10px] sm:text-xs flex items-center gap-1.5 text-muted-foreground'>
                <FileIcon className='h-2.5 w-2.5 sm:h-3 sm:w-3'/>{currentFile?.name}
                <Badge variant='secondary' className='text-[8px] sm:text-[9px] ml-auto h-4'>{language.toUpperCase()}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className='p-0'>
              <Textarea value={currentFile?.content || ''} onChange={e=>updateFile(e.target.value)}
                onKeyDown={e=>{if((e.ctrlKey||e.metaKey)&&e.key==='Enter'){e.preventDefault();executeCode();}}}
                className='font-mono text-[11px] sm:text-sm min-h-[250px] sm:min-h-[350px] lg:min-h-[450px] rounded-none border-0 resize-y focus-visible:ring-0'
                placeholder='Code...'/>
            </CardContent>
          </Card>
        </div>

        {/* Output */}
        <div className='w-full lg:w-[45%] xl:w-[40%] min-w-0'>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className='w-full h-8'>
              <TabsTrigger value='output' className='flex-1 text-[10px] sm:text-xs'><Terminal className='h-3 w-3 mr-1'/>Console</TabsTrigger>
              <TabsTrigger value='preview' className='flex-1 text-[10px] sm:text-xs'><Monitor className='h-3 w-3 mr-1'/>Preview</TabsTrigger>
              <TabsTrigger value='history' className='flex-1 text-[10px] sm:text-xs hidden sm:flex'><Clock className='h-3 w-3 mr-1'/>Hist.</TabsTrigger>
            </TabsList>
            <TabsContent value='output' className='mt-2'>
              <Card><CardContent className='p-0'>
                <pre className='font-mono text-[11px] sm:text-sm p-2 sm:p-4 min-h-[200px] sm:min-h-[350px] lg:min-h-[450px] max-h-[300px] sm:max-h-[600px] overflow-auto bg-black/5 dark:bg-white/5 rounded-lg whitespace-pre-wrap break-all'>
                  {error ? <span className='text-red-500 flex items-center gap-1.5 text-xs'><AlertCircle className='h-3 w-3'/>{error}</span> : output || <span className='text-muted-foreground text-xs'>Executez...</span>}
                </pre>
              </CardContent></Card>
            </TabsContent>
            <TabsContent value='preview' className='mt-2'>
              <Card><CardContent className='p-0'>
                <iframe ref={iframeRef} className='w-full min-h-[200px] sm:min-h-[350px] lg:min-h-[450px] rounded-lg border-0' src='about:blank' sandbox='allow-scripts allow-modals' title='Preview'/>
              </CardContent></Card>
            </TabsContent>
            <TabsContent value='history' className='mt-2'>
              <Card><CardContent className='p-2 max-h-[450px] overflow-y-auto'>
                {history.length===0 ? <p className='text-xs text-muted-foreground text-center py-6'>Aucune execution</p> :
                  <div className='space-y-1'>{history.map((item,i)=>(
                    <div key={i} className='p-1.5 rounded border bg-card text-[10px]'>
                      <div className='flex items-center gap-1.5 mb-0.5'><Badge variant='secondary' className='text-[8px] h-3.5'>{item.project}</Badge><span className='text-muted-foreground'>{item.time.toFixed(0)}ms</span></div>
                      <pre className='line-clamp-1 font-mono text-[9px] text-muted-foreground'>{item.output.slice(0,80)}</pre>
                    </div>
                  ))}</div>}
              </CardContent></Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {/* Footer */}
      <div className='flex flex-col sm:flex-row items-start sm:items-center justify-between text-[10px] sm:text-xs text-muted-foreground gap-1'>
        <span>Ctrl+Enter &middot; {project.files.length} fichier(s) &middot; {currentFile?.content?.length || 0} car.</span>
        <span className='text-[9px] sm:text-xs'>{project.id ? 'Sauvegarde' : 'Non sauvegarde'}</span>
      </div>
    </div>
  );
}

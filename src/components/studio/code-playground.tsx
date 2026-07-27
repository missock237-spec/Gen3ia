'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import {
  Play, Copy, RotateCcw, Terminal, Monitor, Clock, Code, FileCode,
  Loader2, Trash2, Save, FolderOpen, Plus, Download, Share2, File,
  Files, X, Check, AlertCircle, GripVertical, Undo, Redo, Settings,
} from 'lucide-react';

interface CodeFile {
  name: string;
  content: string;
  language: string;
}

interface CodeProject {
  id?: string;
  name: string;
  language: string;
  files: CodeFile[];
  fileCount?: number;
  updatedAt?: string;
}

const FILE_ICONS: Record<string, React.ElementType> = { js: FileCode, ts: Code, jsx: FileCode, tsx: Code, html: Code, css: Code, json: File, py: FileCode, sql: File, bash: Terminal };

const PROJECT_TEMPLATES: Record<string, CodeProject> = {
  blank: { name: 'Projet vierge', language: 'javascript', files: [{ name: 'index.js', content: '// Projet vierge\nconsole.log("Bonjour Genova!");', language: 'javascript' }] },
  'hello-react': { name: 'Hello React', language: 'jsx', files: [
    { name: 'App.jsx', content: 'import React, { useState } from "react";\nconst App = () => {\n  const [count, setCount] = useState(0);\n  return (\n    <div style={{padding:40,fontFamily:"sans-serif",textAlign:"center"}}>\n      <h1 style={{color:"#6c5ce7"}}>Hello Genova!</h1>\n      <p style={{fontSize:24}}>Compteur: {count}</p>\n      <button onClick={()=>setCount(c=>c+1)} style={{padding:"8px 16px",background:"#6c5ce7",color:"white",border:"none",borderRadius:4,cursor:"pointer",margin:4}}>+</button>\n      <button onClick={()=>setCount(c=>c-1)} style={{padding:"8px 16px",background:"#e17055",color:"white",border:"none",borderRadius:4,cursor:"pointer",margin:4}}>-</button>\n    </div>\n  );\n};\nconsole.log(React.createElement(App));', language: 'jsx' },
    { name: 'style.css', content: 'body { margin: 0; background: linear-gradient(135deg, #667eea, #764ba2); min-height: 100vh; display: flex; justify-content: center; align-items: center; }', language: 'css' },
  ] },
  'api-express': { name: 'API Express', language: 'javascript', files: [
    { name: 'server.js', content: 'const express = require("express");\nconst app = express();\napp.use(express.json());\n\nconst users = [{ id: 1, name: "Alice" }, { id: 2, name: "Bob" }];\n\napp.get("/api/users", (req, res) => {\n  res.json(users);\n});\n\napp.post("/api/users", (req, res) => {\n  const user = { id: users.length + 1, ...req.body };\n  users.push(user);\n  res.status(201).json(user);\n});\n\napp.listen(3000, () => console.log("API sur port 3000"));', language: 'javascript' },
  ] },
  'data-viz': { name: 'Data Viz', language: 'html', files: [
    { name: 'chart.html', content: '<!DOCTYPE html><html><head><script src="https://cdn.jsdelivr.net/npm/chart.js"></script><style>body{font-family:sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh;background:#1a1a2e;margin:0}.chart-container{width:600px;background:#16213e;border-radius:16px;padding:24px;box-shadow:0 20px 60px rgba(0,0,0,0.3)}h2{color:#fff;text-align:center;margin-bottom:20px}</style></head><body><div class="chart-container"><h2>Ventes 2024</h2><canvas id="myChart"></canvas></div><script>new Chart(document.getElementById("myChart"), {type:"bar",data:{labels:["Jan","Fev","Mar","Avr","Mai","Juin"],datasets:[{label:"Ventes 2024",data:[12,19,3,5,2,3],backgroundColor:["rgba(108,92,231,0.8)","rgba(0,206,201,0.8)","rgba(255,107,107,0.8)","rgba(254,202,87,0.8)","rgba(116,185,255,0.8)","rgba(162,155,254,0.8)"],borderRadius:6}]},options:{responsive:true,plugins:{legend:{labels:{color:"#fff"}}},scales:{y:{ticks:{color:"#aaa"},grid:{color:"rgba(255,255,255,0.05)"}},x:{ticks:{color:"#aaa"},grid:{color:"rgba(255,255,255,0.05)"}}}}});</script></body></html>', language: 'html' },
  ] },
  'snake-game': { name: 'Snake Game', language: 'html', files: [
    { name: 'snake.html', content: '<!DOCTYPE html><html><head><style>body{margin:0;display:flex;justify-content:center;align-items:center;min-height:100vh;background:#1a1a2e;font-family:sans-serif}canvas{border:2px solid #6c5ce7;border-radius:8px;background:#16213e}.score{color:#fff;font-size:24px;text-align:center;margin-bottom:16px}button{padding:8px 24px;background:#6c5ce7;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:16px;margin-top:12px}.game-over{color:#ff6b6b;font-size:20px;text-align:center;margin-top:12px}</style></head><body><div><div class="score">Score: <span id="score">0</span></div><canvas id="game" width="400" height="400"></canvas><div style="text-align:center"><button onclick="init()">Nouvelle partie</button><p class="game-over" id="gameOver"></p></div></div><script>const canvas=document.getElementById("game"),ctx=canvas.getContext("2d"),scale=20,rows=canvas.height/scale,cols=canvas.width/scale;let snake,direction,food,score,gameLoop;
function init(){snake=[{x:10,y:10}],direction={x:0,y:0},score=0,document.getElementById("score").textContent=0,document.getElementById("gameOver").textContent="",food={x:Math.floor(Math.random()*cols),y:Math.floor(Math.random()*rows)},clearInterval(gameLoop),gameLoop=setInterval(update,150)}
function update(){snake.unshift({x:snake[0].x+direction.x,y:snake[0].y+direction.y}),snake[0].x===food.x&&snake[0].y===food.y?(score++,document.getElementById("score").textContent=score,food={x:Math.floor(Math.random()*cols),y:Math.floor(Math.random()*rows)}):snake.pop();if(snake[0].x<0||snake[0].x>=cols||snake[0].y<0||snake[0].y>=rows){gameOver();return}for(let i=1;i<snake.length;i++){if(snake[i].x===snake[0].x&&snake[i].y===snake[0].y){gameOver();return}}draw()}
function gameOver(){clearInterval(gameLoop),document.getElementById("gameOver").textContent="Game Over! Score: "+score}
function draw(){ctx.fillStyle="#16213e",ctx.fillRect(0,0,canvas.width,canvas.height);ctx.fillStyle="#6c5ce7",snake.forEach(p=>ctx.fillRect(p.x*scale,p.y*scale,scale-2,scale-2));ctx.fillStyle="#ff6b6b",ctx.beginPath(),ctx.arc(food.x*scale+scale/2,food.y*scale+scale/2,scale/2-2,0,Math.PI*2),ctx.fill()}
document.addEventListener("keydown",e=>{switch(e.key){case"ArrowUp":direction.y==0&&(direction={x:0,y:-1});break;case"ArrowDown":direction.y==0&&(direction={x:0,y:1});break;case"ArrowLeft":direction.x==0&&(direction={x:-1,y:0});break;case"ArrowRight":direction.x==0&&(direction={x:1,y:0});break}}),init();</script></body></html>', language: 'html' },
  ] },
  'todo-app': { name: 'Todo App', language: 'jsx', files: [
    { name: 'App.jsx', content: 'import React, { useState } from "react";\nexport default function TodoApp() {\n  const [todos, setTodos] = useState([\n    { id: 1, text: "Apprendre Genova", done: true },\n    { id: 2, text: "Creer un agent", done: false },\n    { id: 3, text: "Connecter GitHub", done: false },\n  ]);\n  const [input, setInput] = useState("");\n  const addTodo = () => {\n    if (!input.trim()) return;\n    setTodos([...todos, { id: Date.now(), text: input, done: false }]);\n    setInput("");\n  };\n  const toggleTodo = (id) => {\n    setTodos(todos.map(t => t.id === id ? { ...t, done: !t.done } : t));\n  };\n  const deleteTodo = (id) => {\n    setTodos(todos.filter(t => t.id !== id));\n  };\n  return (\n    <div style={{maxWidth:400,margin:"40px auto",fontFamily:"sans-serif"}}>\n      <h1 style={{color:"#6c5ce7"}}>Todo App</h1>\n      <div style={{display:"flex",gap:8,marginBottom:16}}>\n        <input value={input} onChange={e=>setInput(e.target.value)}\n          onKeyDown={e=>e.key==="Enter"&&addTodo()}\n          style={{flex:1,padding:"8px 12px",borderRadius:6,border:"1px solid #ddd",fontSize:14}} placeholder="Nouvelle tache..." />\n        <button onClick={addTodo} style={{padding:"8px 16px",background:"#6c5ce7",color:"white",border:"none",borderRadius:6,cursor:"pointer"}}>Ajouter</button>\n      </div>\n      {todos.map(t => (\n        <div key={t.id} style={{display:"flex",alignItems:"center",gap:8,padding:"8px 12px",borderBottom:"1px solid #eee"}}>\n          <input type="checkbox" checked={t.done} onChange={()=>toggleTodo(t.id)} />\n          <span style={{flex:1,textDecoration:t.done?"line-through":"none",color:t.done?"#999":"#333"}}>{t.text}</span>\n          <button onClick={()=>deleteTodo(t.id)} style={{background:"none",border:"none",color:"#e17055",cursor:"pointer",fontSize:16}}>x</button>\n        </div>\n      ))} \n      <p style={{textAlign:"center",color:"#999",marginTop:16,fontSize:12}}>{todos.filter(t=>!t.done).length} tache(s) restante(s)</p>\n    </div>\n  );\n}', language: 'jsx' },
  ] },
  '3d-scene': { name: 'Scene 3D', language: 'html', files: [
    { name: 'scene.html', content: '<!DOCTYPE html><html><head><script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script><style>body{margin:0;overflow:hidden}canvas{display:block}</style></head><body><script>const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(75,window.innerWidth/window.innerHeight,0.1,1000),renderer=new THREE.WebGLRenderer({antialias:true});renderer.setSize(window.innerWidth,window.innerHeight),document.body.appendChild(renderer.domElement);const geo=new THREE.TorusKnotGeometry(1,0.3,128,16),mat=new THREE.MeshStandardMaterial({color:0x6c5ce7,metalness:0.8,roughness:0.2}),mesh=new THREE.Mesh(geo,mat);scene.add(mesh);const light1=new THREE.PointLight(0x6c5ce7,1,10);light1.position.set(2,2,2),scene.add(light1);const light2=new THREE.PointLight(0x00cec9,1,10);light2.position.set(-2,-2,2),scene.add(light2);scene.add(new THREE.AmbientLight(0x404040));camera.position.z=4;function animate(){requestAnimationFrame(animate),mesh.rotation.x+=0.01,mesh.rotation.y+=0.02,renderer.render(scene,camera)}animate();window.addEventListener("resize",()=>{camera.aspect=window.innerWidth/window.innerHeight,camera.updateProjectionMatrix(),renderer.setSize(window.innerWidth,window.innerHeight)});</script></body></html>', language: 'html' },
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
  const [sharing, setSharing] = useState(false);
  const [showNewFile, setShowNewFile] = useState(false);
  const [newFileName, setNewFileName] = useState('');
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => { loadSavedProjects(); }, []);

  const loadSavedProjects = async () => {
    try {
      const res = await fetch('/api/code/projects');
      if (res.ok) {
        const data = await res.json();
        setSavedProjects(data.projects || []);
      }
    } catch {}
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
    const langMap: Record<string,string> = { js:'javascript', ts:'typescript', tsx:'tsx', jsx:'jsx', html:'html', css:'css', py:'python', json:'json', sql:'sql', sh:'bash', yaml:'yaml', md:'markdown' };
    const lang = langMap[ext] || 'javascript';
    const files = [...project.files, { name: newFileName.trim(), content: '', language: lang }];
    setProject({ ...project, files });
    setActiveFile(files.length - 1);
    setShowNewFile(false);
    setNewFileName('');
  };

  const removeFile = (index: number) => {
    if (project.files.length <= 1) return;
    const files = project.files.filter((_, i) => i !== index);
    setProject({ ...project, files });
    if (activeFile >= files.length) setActiveFile(files.length - 1);
  };

  const loadTemplate = (key: string) => {
    const tpl = PROJECT_TEMPLATES[key];
    if (tpl) {
      setProject(JSON.parse(JSON.stringify(tpl)));
      setActiveFile(0);
      setOutput('');
      setError(null);
      setProjectName(tpl.name);
      setShowTemplates(false);
    }
  };

  const loadProject = async (id: string) => {
    try {
      const res = await fetch('/api/code/projects');
      if (res.ok) {
        const data = await res.json();
        const found = data.projects.find((p: {id:string}) => p.id === id);
        if (found) {
          const detailRes = await fetch('/api/code/projects?id=' + id);
          if (detailRes.ok) {
            const detail = await detailRes.json();
            setProject({ ...detail.project, files: JSON.parse(detail.project.files) });
            setProjectName(detail.project.name);
            setActiveFile(0);
            setShowProjects(false);
          }
        }
      }
    } catch {}
  };

  const saveProject = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/code/projects', {
        method: project.id ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: project.id,
          name: projectName,
          language,
          files: project.files,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setProject({ ...project, id: data.project?.id || data.project?.id });
        toast.success('Projet sauvegarde !');
        loadSavedProjects();
      }
    } catch { toast.error('Erreur sauvegarde'); }
    finally { setSaving(false); }
  };

  const shareProject = async () => {
    setSharing(true);
    try {
      const base64 = btoa(JSON.stringify(project.files));
      const url = window.location.origin + '/studio/code?shared=' + base64;
      await navigator.clipboard.writeText(url);
      toast.success('Lien de partage copie !');
    } catch { toast.error('Erreur partage'); }
    finally { setSharing(false); }
  };

  const downloadProject = () => {
    const blob = new Blob([project.files.map(f => '// ' + f.name + '\n' + f.content).join('\n\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = projectName.replace(/\s+/g, '_') + '.txt';
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Projet telecharge');
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
          fullHtml = '<!DOCTYPE html><html><head><style>' + (cssFile?.content || '') + '</style></head><body>' +
            (fullHtml || '<div id="root"></div>') +
            '<script src="https://unpkg.com/react@18/umd/react.production.min.js"></script>' +
            '<script src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>' +
            '<script>' + (jsxFile?.content || '') + '</script></body></html>';
        }
        const blob = new Blob([fullHtml], { type: 'text/html' });
        if (iframeRef.current) iframeRef.current.src = URL.createObjectURL(blob);
        setOutput('Rendu HTML dans Visualisation');
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
      const fn = new Function('console', code);
      fn(c);
      const elapsed = performance.now() - start;
      setOutput(logs.join('\n') || 'Succes');
      setExecutionTime(elapsed);
      setHistory(p => [{project:projectName,output:logs.join('\n'),time:elapsed},...p].slice(0,20));
    } catch (err) { setError('Erreur: ' + (err instanceof Error ? err.message : '?')); }
    finally { setExecuting(false); }
  }, [currentFile, project.files, projectName]);

  const fileIcon = FILE_ICONS[currentFile?.name?.split('.').pop() || ''] || FileCode;
  const FileIcon = fileIcon;

  return (
    <div className='space-y-4'>
      {/* Barre d'outils */}
      <div className='flex items-center justify-between flex-wrap gap-2'>
        <div className='flex items-center gap-2'>
          <h2 className='text-xl font-bold'>{projectName}</h2>
          <div className='flex gap-1'>
            <Button variant='outline' size='sm' className='h-7 text-xs' onClick={()=>setShowTemplates(!showTemplates)}>
              <FolderOpen className='h-3 w-3 mr-1'/>Templates
            </Button>
            <Button variant='outline' size='sm' className='h-7 text-xs' onClick={()=>setShowProjects(!showProjects)}>
              <Files className='h-3 w-3 mr-1'/>Projets
            </Button>
          </div>
        </div>
        <div className='flex items-center gap-1.5 flex-wrap'>
          {executionTime!==null && <Badge variant='outline' className='text-xs'><Clock className='h-3 w-3 mr-1'/>{executionTime.toFixed(0)}ms</Badge>}
          <Button variant='ghost' size='sm' className='h-8 text-xs' onClick={downloadProject}><Download className='h-3 w-3 mr-1'/>DL</Button>
          <Button variant='ghost' size='sm' className='h-8 text-xs' onClick={shareProject} disabled={sharing}>
            {sharing ? <Loader2 className='h-3 w-3 animate-spin'/> : <Share2 className='h-3 w-3'/>}
          </Button>
          <Button variant='outline' size='sm' className='h-8 text-xs' onClick={saveProject} disabled={saving}>
            {saving ? <Loader2 className='h-3 w-3 mr-1 animate-spin'/> : <Save className='h-3 w-3 mr-1'/>}Sauvegarder
          </Button>
          <Button variant='default' size='sm' className='h-8' onClick={executeCode} disabled={executing}>
            {executing ? <Loader2 className='h-3 w-3 mr-1 animate-spin'/> : <Play className='h-3 w-3 mr-1'/>}
            Executer
          </Button>
        </div>
      </div>

      {/* Panneau Templates */}
      {showTemplates && (
        <Card className='border-primary/20'>
          <CardContent className='p-3'>
            <div className='flex items-center justify-between mb-2'>
              <span className='text-sm font-semibold'>Templates</span>
              <Button variant='ghost' size='sm' className='h-6 w-6 p-0' onClick={()=>setShowTemplates(false)}><X className='h-4 w-4'/></Button>
            </div>
            <div className='grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2'>
              {Object.entries(PROJECT_TEMPLATES).map(([key, tpl]) => (
                <Button key={key} variant='outline' size='sm' className='h-12 text-xs justify-start' onClick={()=>loadTemplate(key)}>
                  <FileCode className='h-4 w-4 mr-2 shrink-0'/>{tpl.name}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Panneau Projets sauvegardes */}
      {showProjects && (
        <Card className='border-primary/20'>
          <CardContent className='p-3'>
            <div className='flex items-center justify-between mb-2'>
              <span className='text-sm font-semibold'>Mes Projets ({savedProjects.length})</span>
              <Button variant='ghost' size='sm' className='h-6 w-6 p-0' onClick={()=>setShowProjects(false)}><X className='h-4 w-4'/></Button>
            </div>
            {savedProjects.length === 0 ? (
              <p className='text-xs text-muted-foreground'>Aucun projet sauvegarde</p>
            ) : (
              <div className='grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2'>
                {savedProjects.map(p => (
                  <Button key={p.id} variant='outline' size='sm' className='h-10 text-xs justify-start' onClick={()=>loadProject(p.id)}>
                    <FileCode className='h-3 w-3 mr-2'/>{p.name}
                    <Badge variant='secondary' className='text-[8px] ml-auto'>{p.language}</Badge>
                  </Button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Fichiers + Editeur + Output */}
      <div className='grid grid-cols-1 lg:grid-cols-2 gap-4'>
        <div>
          {/* Onglets fichiers */}
          <div className='flex items-center gap-0.5 mb-2 overflow-x-auto pb-1'>
            {project.files.map((f, i) => {
              const ExtIcon = FILE_ICONS[f.name?.split('.').pop() || ''] || FileCode;
              return (
                <div key={i} className={`flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-t cursor-pointer border-b-2 transition-colors ${i===activeFile ? 'border-primary bg-accent font-medium' : 'border-transparent hover:bg-accent/50'}`}
                  onClick={()=>setActiveFile(i)}>
                  <ExtIcon className='h-3 w-3'/>
                  {f.name}
                  {project.files.length > 1 && (
                    <button onClick={(e)=>{e.stopPropagation();removeFile(i);}} className='ml-1 text-muted-foreground hover:text-destructive'><X className='h-3 w-3'/></button>
                  )}
                </div>
              );
            })}
            <Button variant='ghost' size='sm' className='h-7 w-7 p-0 ml-1' onClick={()=>setShowNewFile(!showNewFile)} title='Nouveau fichier'>
              <Plus className='h-3 w-3'/>
            </Button>
          </div>

          {showNewFile && (
            <div className='flex items-center gap-2 mb-2'>
              <Input value={newFileName} onChange={e=>setNewFileName(e.target.value)} placeholder='fichier.tsx' className='h-8 text-xs' onKeyDown={e=>e.key==='Enter'&&addFile()}/>
              <Button size='sm' className='h-8 text-xs' onClick={addFile}><Plus className='h-3 w-3 mr-1'/>Ajouter</Button>
            </div>
          )}

          {/* Editeur */}
          <Card>
            <CardHeader className='pb-2 px-4 pt-3'>
              <CardTitle className='text-xs flex items-center gap-2 text-muted-foreground'>
                <FileIcon className='h-3 w-3'/>{currentFile?.name}
                <Badge variant='secondary' className='text-[9px] ml-auto'>{language.toUpperCase()}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className='p-0'>
              <Textarea
                value={currentFile?.content || ''}
                onChange={e => updateFile(e.target.value)}
                onKeyDown={e=>{if((e.ctrlKey||e.metaKey)&&e.key==='Enter'){e.preventDefault();executeCode();}}}
                className='font-mono text-sm min-h-[450px] rounded-none border-0 resize-y focus-visible:ring-0'
                placeholder='Ecrivez votre code...'
              />
            </CardContent>
          </Card>
        </div>

        {/* Output */}
        <div className='space-y-4'>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className='w-full'>
              <TabsTrigger value='output' className='flex-1 text-xs'><Terminal className='h-3 w-3 mr-1'/>Console</TabsTrigger>
              <TabsTrigger value='preview' className='flex-1 text-xs'><Monitor className='h-3 w-3 mr-1'/>Preview</TabsTrigger>
              <TabsTrigger value='history' className='flex-1 text-xs'><Clock className='h-3 w-3 mr-1'/>Historique</TabsTrigger>
            </TabsList>
            <TabsContent value='output'>
              <Card><CardContent className='p-0'>
                <pre className='font-mono text-sm p-4 min-h-[450px] max-h-[600px] overflow-auto bg-black/5 dark:bg-white/5 rounded-lg whitespace-pre-wrap'>
                  {error ? <span className='text-red-500 flex items-center gap-2'><AlertCircle className='h-4 w-4'/>{error}</span>
                  : output || <span className='text-muted-foreground'>Executez le code...</span>}
                </pre>
              </CardContent></Card>
            </TabsContent>
            <TabsContent value='preview'>
              <Card><CardContent className='p-0'>
                <iframe ref={iframeRef} className='w-full min-h-[450px] rounded-lg border-0' src='about:blank' sandbox='allow-scripts allow-modals' title='Preview'/>
              </CardContent></Card>
            </TabsContent>
            <TabsContent value='history'>
              <Card><CardContent className='p-3 max-h-[450px] overflow-y-auto'>
                {history.length===0 ? <p className='text-sm text-muted-foreground text-center py-8'>Aucune execution</p>
                : <div className='space-y-1'>{history.map((item,i)=>(
                  <div key={i} className='p-2 rounded border bg-card text-xs'>
                    <div className='flex items-center gap-2 mb-1'><Badge variant='secondary' className='text-[9px]'>{item.project}</Badge><span className='text-muted-foreground'>{item.time.toFixed(0)}ms</span></div>
                    <pre className='line-clamp-2 font-mono text-[10px] text-muted-foreground'>{item.output.slice(0,150)}</pre>
                  </div>
                ))}</div>}
              </CardContent></Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>

      <div className='flex items-center justify-between text-xs text-muted-foreground'>
        <span>Ctrl+Enter executer &middot; {project.files.length} fichier(s) &middot; {currentFile?.content?.length || 0} car.</span>
        <span>{project.id ? 'Sauvegarde' : 'Non sauvegarde'}</span>
      </div>
    </div>
  );
}

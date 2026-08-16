'use client';
import { useState } from 'react';
import { Image, Video, Sparkles } from 'lucide-react';
export function MediaView() {
  const [tab, setTab] = useState<'images'|'videos'>('images');
  const [prompt, setPrompt] = useState('');
  const [gen, setGen] = useState(false);
  const generate = async () => {
    if (!prompt.trim()) return;
    setGen(true);
    const t = localStorage.getItem('genova_token');
    const u = JSON.parse(localStorage.getItem('genova_user') || '{}')?.id;
    await fetch(tab === 'images' ? '/api/images' : '/api/videos', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` }, body: JSON.stringify({ userId: u, prompt }) });
    setPrompt(''); setGen(false);
  };
  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-bold">Media</h1><p className="text-muted-foreground">Generation d&apos;images et videos</p></div>
      <div className="flex gap-2 border-b border-border pb-1">
        {/* eslint-disable-next-line jsx-a11y/alt-text -- lucide-react Image icon, not HTML img */}
        <button onClick={() => setTab('images')} className={`px-4 py-2 text-sm rounded-t-lg ${tab === 'images' ? 'bg-card border border-border font-medium' : 'text-muted-foreground'}`}><Image className="h-4 w-4 inline mr-1" />Images</button>
        <button onClick={() => setTab('videos')} className={`px-4 py-2 text-sm rounded-t-lg ${tab === 'videos' ? 'bg-card border border-border font-medium' : 'text-muted-foreground'}`}><Video className="h-4 w-4 inline mr-1" />Videos</button>
      </div>
      <div className="flex gap-2">
        <input type="text" value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Decrivez le media..." className="flex-1 px-4 py-2 rounded-lg border border-border bg-background text-sm" />
        <button onClick={generate} disabled={gen || !prompt.trim()} className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm disabled:opacity-50"><Sparkles className="h-4 w-4" /> Generer</button>
      </div>
    </div>
  );
}

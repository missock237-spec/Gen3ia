"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { useTheme } from "next-themes";
import { Terminal as TermIcon, Copy, Play, Square, FileCode } from "lucide-react";

function langColor(p: string) {
  const m: Record<string, string> = { ts: "text-blue-400", tsx: "text-blue-400", js: "text-yellow-400", py: "text-green-400" };
  return m[p.split(".").pop() || ""] || "text-gray-300";
}

interface TerminalProps {
  agentId?: string;
  userId?: string;
}

interface Line {
  id: string;
  type: "input" | "output" | "error" | "system" | "info";
  content: string;
  ts: number;
}

interface FileEntry {
  path: string;
  content: string;
  size: number;
  language?: string;
  action?: string;
}

export default function TerminalComponent({ agentId, userId }: TerminalProps) {
  const [lines, setLines] = useState<Line[]>([
    { id: "w", type: "system", content: "Gen3ia Terminal v1.0\nCommandes: help, clear, ls, cat <f>, status, files, history, create <f>\nToutes les autres commandes sont executees en temps reel.", ts: Date.now() }
  ]);
  const [input, setInput] = useState("");
  const [running, setRunning] = useState(false);
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [tab, setTab] = useState<"term" | "files">("term");
  const [sel, setSel] = useState<string | null>(null);
  const ir = useRef<HTMLInputElement>(null);
  const tr = useRef<HTMLDivElement>(null);
  const { theme } = useTheme();
  const dark = theme === "dark";

  useEffect(() => { tr.current?.scrollTo({ top: tr.current.scrollHeight, behavior: "smooth" }); }, [lines]);

  const add = useCallback((l: Omit<Line, "id" | "ts">) => {
    setLines(p => [...p, { ...l, id: "l" + Date.now() + Math.random().toString(36).slice(2, 6), ts: Date.now() }]);
  }, []);

  const exec = useCallback(async (c: string) => {
    const t = c.trim();
    if (!t || running) return;
    setRunning(true);
    add({ type: "input", content: "$ " + t });

    if (t === "clear") {
      setLines([{ id: "c", type: "system", content: "Terminal nettoye.", ts: Date.now() }]);
      setRunning(false);
      return;
    }
    if (t === "help") {
      add({ type: "output", content: "Commandes locales: help, clear, ls, cat <fichier>, files, history\nToutes les autres commandes sont executees en temps reel sur le serveur (bash)." });
      setRunning(false);
      return;
    }
    if (t === "ls") {
      add({ type: "output", content: files.length === 0 ? "Aucun fichier dans la session." : files.map(f => "  " + f.path + " (" + (f.size / 1024).toFixed(1) + " KB)").join("\n") });
      setRunning(false);
      return;
    }
    if (t.startsWith("cat ")) {
      const f = files.find(x => x.path === t.slice(4).trim());
      add({ type: f ? "output" : "error", content: f ? f.content.substring(0, 2000) : "Fichier non trouve" });
      setRunning(false);
      return;
    }
    if (t === "files") { setTab("files"); setRunning(false); return; }

    try {
      const r = await fetch("/api/terminal/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: t, agentId, userId }),
      });
      const d = await r.json();
      add({ type: d.success ? "output" : "error", content: d.output || JSON.stringify(d) });
      if (d.files?.length > 0) {
        setFiles(p => [...p, ...d.files]);
        add({ type: "info", content: d.files.length + " fichier(s) genere(s)." });
      }
    } catch {
      add({ type: "error", content: "Erreur reseau" });
    }
    setRunning(false);
  }, [add, agentId, userId, files, running]);

  return (
    <div className={"rounded-xl border overflow-hidden shadow-2xl " + (dark ? "bg-gray-950 border-gray-800" : "bg-gray-900 border-gray-700")}>
      <div className="flex items-center justify-between px-4 py-2 bg-gray-800 border-b border-gray-700">
        <div className="flex items-center gap-3">
          <div className="flex gap-1.5">
            <div className="w-3 h-3 rounded-full bg-red-500" />
            <div className="w-3 h-3 rounded-full bg-yellow-500" />
            <div className="w-3 h-3 rounded-full bg-green-500" />
          </div>
          <TermIcon className="w-4 h-4 text-gray-400" />
          <span className="text-sm font-medium text-gray-300">Gen3ia Terminal</span>
        </div>
        <button onClick={() => setTab(tab === "term" ? "files" : "term")}
          className={"px-3 py-1 text-xs rounded-lg flex items-center gap-1 " + (tab === "files" ? "bg-gray-700 text-white" : "text-gray-400 hover:text-white")}>
          <FileCode className="w-3 h-3" /> Fichiers
          {files.length > 0 && <span className="bg-blue-500 text-white text-[10px] px-1.5 py-0.5 rounded-full">{files.length}</span>}
        </button>
      </div>

      {tab === "term" ? (
        <>
          <div ref={tr} className="h-80 overflow-y-auto p-4 font-mono text-sm" style={{ backgroundColor: "#0a0a0a" }}>
            {lines.map(l => (
              <div key={l.id} className={"flex gap-2 " + (l.type === "input" ? "text-green-400" : l.type === "error" ? "text-red-400" : l.type === "system" ? "text-cyan-400 text-xs" : "text-gray-300")}>
                <span className="w-4 shrink-0">{l.type === "input" ? ">" : l.type === "error" ? "X" : " "}</span>
                <pre className="whitespace-pre-wrap m-0">{l.content}</pre>
              </div>
            ))}
            {running && <div className="text-yellow-400 animate-pulse">Execution en cours...</div>}
          </div>
          <div className="flex items-center gap-2 px-4 py-2.5 border-t border-gray-700" style={{ backgroundColor: "#0d0d0d" }}>
            <span className="text-green-400 font-mono text-sm">$</span>
            <input ref={ir} type="text" value={input} onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") { exec(input); setInput(""); } }} disabled={running}
              placeholder="help pour les commandes..." className="flex-1 bg-transparent text-gray-200 font-mono text-sm outline-none placeholder-gray-600" />
            <button onClick={() => { exec(input); setInput(""); }} disabled={running || !input.trim()}
              className="p-1.5 rounded hover:bg-gray-700 text-gray-400 hover:text-green-400 disabled:opacity-30">
              {running ? <Square className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            </button>
          </div>
        </>
      ) : (
        <div className="h-96 flex" style={{ backgroundColor: "#0a0a0a" }}>
          <div className="w-48 border-r border-gray-800 overflow-y-auto p-2">
            <div className="text-xs text-gray-500 font-semibold px-2 py-2">Fichiers</div>
            {files.length === 0 ? (
              <div className="text-xs text-gray-600 p-4 text-center"><FileCode className="w-8 h-8 mx-auto mb-2 opacity-30" />Aucun fichier</div>
            ) : files.map(f => (
              <button key={f.path} onClick={() => setSel(f.path)}
                className={"w-full text-left px-2 py-1.5 rounded text-xs font-mono " + (sel === f.path ? "bg-blue-900/50 text-blue-200" : "text-gray-400 hover:bg-gray-800")}>
                <span className={langColor(f.path)}>F </span>{f.path.split("/").pop()}
              </button>
            ))}
          </div>
          <div className="flex-1 overflow-auto p-4">
            {sel ? (() => {
              const f = files.find(x => x.path === sel);
              if (!f) return null;
              return (
                <div>
                  <div className="flex items-center justify-between mb-2 pb-2 border-b border-gray-800">
                    <FileCode className={"w-4 h-4 " + langColor(f.path)} />
                    <span className="text-sm font-mono text-gray-300">{f.path}</span>
                    <button onClick={() => navigator.clipboard?.writeText(f.content)} className="p-1 hover:bg-gray-800 text-gray-500"><Copy className="w-3.5 h-3.5" /></button>
                  </div>
                  <pre className="font-mono text-xs text-gray-300 whitespace-pre-wrap">{f.content || "/* Vide */"}</pre>
                </div>
              );
            })() : (
              <div className="flex flex-col items-center justify-center h-full text-gray-600">
                <FileCode className="w-12 h-12 mb-3 opacity-20" />
                <p className="text-sm">Selectionnez un fichier</p>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between px-4 py-1 bg-gray-800 border-t border-gray-700 text-[10px] text-gray-500">
        <span className={"inline-block w-1.5 h-1.5 rounded-full mr-1 " + (running ? "bg-yellow-500 animate-pulse" : "bg-green-500")} />{running ? "Execution" : "Pret"}
        <span>Lignes: {lines.length} | Fichiers: {files.length}</span>
      </div>
    </div>
  );
}

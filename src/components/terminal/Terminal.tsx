"use client";

import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useTheme } from "next-themes";
import {
  Terminal as TermIcon, Copy, Play, Square, FileCode,
  ArrowUp, ArrowDown, AlertTriangle, Edit3, Save, Trash2,
  ShieldAlert, X, Wand2, Wifi, WifiOff, Loader2
} from "lucide-react";

function langColor(p: string) {
  const m: Record<string, string> = { ts: "text-blue-400", tsx: "text-blue-400", js: "text-yellow-400", py: "text-green-400" };
  return m[p.split(".").pop() || ""] || "text-gray-300";
}

interface TerminalProps { agentId?: string; userId?: string; }
interface Line { id: string; type: "input" | "output" | "error" | "system" | "info"; content: string; ts: number; }
interface FileEntry { path: string; content: string; size: number; language?: string; action?: string; }

const MAX_HISTORY = 50;

// Liste des commandes disponibles pour l'auto-complétion
const COMMANDS = [
  "help", "clear", "history", "ls", "cat", "files",
  "create", "edit", "read", "view", "delete", "rm",
  "version", "gen3ia", "pwd", "echo", "date", "whoami",
  "status", "agents",
];

export default function TerminalComponent({ agentId, userId }: TerminalProps) {
  const [lines, setLines] = useState<Line[]>([
    { id: "w", type: "system", content: "Gen3ia Terminal v2.1\nCommandes: help, clear, ls, cat, history, files, create, edit, read, delete\nAuto-completion: TAB • WebSocket temps reel", ts: (useState(() => Date.now())[0]) }
  ]);
  const [input, setInput] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [historyIdx, setHistoryIdx] = useState(-1);
  const [running, setRunning] = useState(false);
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [tab, setTab] = useState<"term" | "files">("term");
  const [sel, setSel] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [sudoDialog, setSudoDialog] = useState<{ cmd: string } | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [suggestIdx, setSuggestIdx] = useState(-1);
  const [wsStatus, setWsStatus] = useState<string>("deconnecte");
  const ir = useRef<HTMLInputElement>(null);
  const tr = useRef<HTMLDivElement>(null);
  const { theme } = useTheme();
  const dark = theme === "dark";

  useEffect(() => { tr.current?.scrollTo({ top: tr.current.scrollHeight, behavior: "smooth" }); }, [lines]);

  const idCounterRef = useRef(0);
  const add = useCallback((l: Omit<Line, "id" | "ts">) => {
    idCounterRef.current += 1;
    setLines(p => [...p, { ...l, id: "l" + idCounterRef.current + Math.random().toString(36).slice(2, 6), ts: Date.now() }]);
  }, []);

  // === AUTO-COMPLETION ===
  const updateSuggestions = useCallback((value: string) => {
    if (!value.trim()) { setSuggestions([]); setSuggestIdx(-1); return; }
    const parts = value.split(" ");
    const current = parts[parts.length - 1].toLowerCase();
    if (parts.length === 1) {
      // Auto-complétion des commandes
      const matches = COMMANDS.filter(c => c.startsWith(current) && c !== current);
      setSuggestions(matches.slice(0, 8));
      setSuggestIdx(-1);
    } else {
      // Auto-complétion des fichiers
      const cmd = parts[0].toLowerCase();
      if (["cat", "edit", "read", "view", "delete", "rm"].includes(cmd)) {
        const matches = files
          .map(f => f.path.split("/").pop() || "")
          .filter(name => name.toLowerCase().startsWith(current) && name !== current);
        setSuggestions(matches.slice(0, 8));
        setSuggestIdx(-1);
      } else {
        setSuggestions([]);
        setSuggestIdx(-1);
      }
    }
  }, [files]);

  const applySuggestion = useCallback(() => {
    if (suggestions.length === 0) return;
    const idx = suggestIdx >= 0 ? suggestIdx : 0;
    const sugg = suggestions[idx];
    if (!sugg) return;

    const parts = input.split(" ");
    parts[parts.length - 1] = sugg;
    setInput(parts.join(" ") + " ");
    setSuggestions([]);
    setSuggestIdx(-1);
  }, [suggestions, suggestIdx, input]);

  // === EXECUTION ===
  const runCommand = useCallback(async (cmd: string, sudoToken?: string) => {
    if (!cmd.trim() || running) return;
    setRunning(true);
    setSuggestions([]);
    add({ type: "input", content: "$ " + cmd });
    setHistory(p => [cmd, ...p.filter(h => h !== cmd)].slice(0, MAX_HISTORY));
    setHistoryIdx(-1);

    if (cmd === "clear") { setLines([{ id: "c", type: "system", content: "Terminal nettoye.", ts: Date.now() }]); setRunning(false); return; }
    if (cmd === "help") {
      add({ type: "output", content: "Commandes locales: help, clear, ls, cat <f>, files, history\nFichiers: create <f>, edit <f> <content>, read <f>, delete <f>\nSysteme: Toute commande bash (ls, pwd, echo, date...)\nAuto-completion: TAB pour completer les commandes/fichiers\nWebSocket: Connexion temps reel pour les mises a jour" });
      setRunning(false); return;
    }
    if (cmd === "history") {
      add({ type: "output", content: history.length === 0 ? "Aucun historique." : history.map((h, i) => `  ${i + 1}. ${h}`).join("\n") });
      setRunning(false); return;
    }
    if (cmd === "ls") {
      add({ type: "output", content: files.length === 0 ? "Aucun fichier dans la session." : files.map(f => "  " + f.path + " (" + (f.size / 1024).toFixed(1) + " KB)").join("\n") });
      setRunning(false); return;
    }
    if (cmd.startsWith("cat ")) {
      const f = files.find(x => x.path === cmd.slice(4).trim());
      add({ type: f ? "output" : "error", content: f ? f.content.substring(0, 2000) : "Fichier non trouve" });
      setRunning(false); return;
    }
    if (cmd === "files") { setTab("files"); setRunning(false); return; }

    try {
      const r = await fetch("/api/terminal/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: cmd, agentId, userId, sudoToken }),
      });
      const d = await r.json();

      if (d.sudoRequired) {
        setSudoDialog({ cmd });
        add({ type: "error", content: "[SUDO] Cette commande necessite une elevation de privileges." });
        setRunning(false);
        return;
      }

      add({ type: d.success ? "output" : "error", content: d.output || JSON.stringify(d) });
      if (d.files?.length > 0) {
        setFiles(p => {
          const existing = new Set(p.map(f => f.path));
          return [...p, ...d.files.filter((f: FileEntry) => !existing.has(f.path))];
        });
        add({ type: "info", content: d.files.length + " fichier(s) dans la session." });
      }
    } catch {
      add({ type: "error", content: "Erreur reseau" });
    }
    setRunning(false);
  }, [add, agentId, userId, files, running, history]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      if (sudoDialog) setSudoDialog(null);
      runCommand(input);
      setInput("");
      return;
    }

    // Auto-complétion avec TAB
    if (e.key === "Tab") {
      e.preventDefault();
      if (suggestions.length > 0) {
        const nextIdx = (suggestIdx + 1) % suggestions.length;
        setSuggestIdx(nextIdx);
        // Afficher la suggestion dans l'input (prévisualisation)
        const parts = input.split(" ");
        parts[parts.length - 1] = suggestions[nextIdx];
        setInput(parts.join(" ") + (suggestions.length === 1 ? " " : ""));
        if (suggestions.length === 1) setSuggestions([]);
      }
      return;
    }

    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (history.length === 0) return;
      const newIdx = Math.min(historyIdx + 1, history.length - 1);
      setHistoryIdx(newIdx);
      setInput(history[newIdx] || "");
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (historyIdx <= 0) { setHistoryIdx(-1); setInput(""); return; }
      const newIdx = historyIdx - 1;
      setHistoryIdx(newIdx);
      setInput(history[newIdx] || "");
      return;
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setInput(value);
    updateSuggestions(value);
  };

  const confirmSudo = () => {
    if (!sudoDialog) return;
    setSudoDialog(null);
    runCommand(sudoDialog.cmd, "confirmed");
  };

  const cancelSudo = () => {
    setSudoDialog(null);
    setRunning(false);
  };

  const saveEdit = () => {
    if (!editing) return;
    runCommand(`edit ${editing} ${editContent}`);
    setEditing(null);
    setEditContent("");
  };

  return (
    <div className={"rounded-xl border overflow-hidden shadow-2xl " + (dark ? "bg-gray-950 border-gray-800" : "bg-gray-900 border-gray-700")}>
      {/* En-tete */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-800 border-b border-gray-700">
        <div className="flex items-center gap-3">
          <div className="flex gap-1.5">
            <div className="w-3 h-3 rounded-full bg-red-500" />
            <div className="w-3 h-3 rounded-full bg-yellow-500" />
            <div className="w-3 h-3 rounded-full bg-green-500" />
          </div>
          <TermIcon className="w-4 h-4 text-gray-400" />
          <span className="text-sm font-medium text-gray-300">Gen3ia Terminal</span>
          <span className="text-[10px] bg-gray-700 text-gray-400 px-1.5 py-0.5 rounded">v2.1</span>
        </div>
        <div className="flex items-center gap-2">
          {history.length > 0 && (
            <span className="text-[10px] text-gray-500" title="Fleches haut/bas: historique"><ArrowUp className="w-3 h-3 inline" /> <ArrowDown className="w-3 h-3 inline" /></span>
          )}
          <button onClick={() => setTab(tab === "term" ? "files" : "term")}
            className={"px-3 py-1 text-xs rounded-lg flex items-center gap-1 " + (tab === "files" ? "bg-gray-700 text-white" : "text-gray-400 hover:text-white")}>
            <FileCode className="w-3 h-3" /> Fichiers
            {files.length > 0 && <span className="bg-blue-500 text-white text-[10px] px-1.5 py-0.5 rounded-full">{files.length}</span>}
          </button>
        </div>
      </div>

      {/* Suggestions */}
      {suggestions.length > 0 && (
        <div className="px-4 py-1.5 bg-gray-900 border-b border-gray-700 flex items-center gap-2 overflow-x-auto">
          <Wand2 className="w-3 h-3 text-blue-400 shrink-0" />
          <span className="text-[10px] text-gray-500 mr-1 shrink-0">TAB:</span>
          {suggestions.map((s, i) => (
            <button
              key={s}
              onClick={() => {
                const parts = input.split(" ");
                parts[parts.length - 1] = s;
                setInput(parts.join(" ") + " ");
                setSuggestions([]);
                ir.current?.focus();
              }}
              className={"text-xs px-2 py-0.5 rounded font-mono whitespace-nowrap " +
                (i === suggestIdx || (suggestIdx < 0 && i === 0)
                  ? "bg-blue-900/50 text-blue-300"
                  : "bg-gray-800 text-gray-400 hover:bg-gray-700"
                )}
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Dialogue sudo */}
      {sudoDialog && (
        <div className="px-4 py-3 bg-yellow-950/80 border-b border-yellow-700/50 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm">
            <ShieldAlert className="w-4 h-4 text-yellow-500" />
            <span className="text-yellow-200">Commande sensible détectée</span>
            <code className="text-yellow-300 text-xs bg-yellow-900/50 px-1.5 py-0.5 rounded">{sudoDialog.cmd}</code>
          </div>
          <div className="flex gap-2">
            <button onClick={cancelSudo} className="px-3 py-1 text-xs rounded bg-gray-700 text-gray-300 hover:bg-gray-600">
              <X className="w-3 h-3 inline mr-1" />Annuler
            </button>
            <button onClick={confirmSudo} className="px-3 py-1 text-xs rounded bg-yellow-600 text-white hover:bg-yellow-500 font-medium">
              <ShieldAlert className="w-3 h-3 inline mr-1" />Confirmer
            </button>
          </div>
        </div>
      )}

      {/* Terminal */}
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
            <input ref={ir} type="text" value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              disabled={running}
              placeholder="help pour les commandes... Tab=completion"
              className="flex-1 bg-transparent text-gray-200 font-mono text-sm outline-none placeholder-gray-600"
            />
            <button onClick={() => { runCommand(input); setInput(""); }} disabled={running || !input.trim()}
              className="p-1.5 rounded hover:bg-gray-700 text-gray-400 hover:text-green-400 disabled:opacity-30">
              {running ? <Square className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            </button>
          </div>
        </>
      ) : (
        /* === EXPLORATEUR DE FICHIERS === */
        <div className="h-96 flex" style={{ backgroundColor: "#0a0a0a" }}>
          <div className="w-48 border-r border-gray-800 overflow-y-auto p-2">
            <div className="flex items-center justify-between text-xs text-gray-500 font-semibold px-2 py-2">
              Fichiers
              <button onClick={() => runCommand("create nouveau-fichier.ts")} className="text-blue-400 hover:text-blue-300">+</button>
            </div>
            {files.length === 0 ? (
              <div className="text-xs text-gray-600 p-4 text-center"><FileCode className="w-8 h-8 mx-auto mb-2 opacity-30" />Aucun fichier</div>
            ) : files.map(f => (
              <div key={f.path} className="flex items-center group">
                <button onClick={() => { setSel(f.path); setEditing(null); }}
                  className={"flex-1 text-left px-2 py-1.5 rounded text-xs font-mono " + (sel === f.path && !editing ? "bg-blue-900/50 text-blue-200" : "text-gray-400 hover:bg-gray-800")}>
                  <span className={langColor(f.path)}>F </span>{f.path.split("/").pop()}
                </button>
                <button onClick={() => { setEditing(f.path); setEditContent(f.content); setSel(f.path); }}
                  className="hidden group-hover:block p-1 text-gray-600 hover:text-blue-400">
                  <Edit3 className="w-3 h-3" />
                </button>
                <button onClick={() => runCommand(`delete ${f.path}`)}
                  className="hidden group-hover:block p-1 text-gray-600 hover:text-red-400">
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
          <div className="flex-1 overflow-auto p-4">
            {editing && editing === sel ? (
              <div>
                <div className="flex items-center justify-between mb-2 pb-2 border-b border-gray-800">
                  <div className="flex items-center gap-2">
                    <Edit3 className={"w-4 h-4 " + langColor(editing)} />
                    <span className="text-sm font-mono text-blue-300">{editing}</span>
                    <span className="text-[10px] text-yellow-500 bg-yellow-900/30 px-1.5 py-0.5 rounded">Edition</span>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => { setEditing(null); setEditContent(""); }}
                      className="px-2 py-1 text-xs rounded bg-gray-700 text-gray-300 hover:bg-gray-600">Annuler</button>
                    <button onClick={saveEdit}
                      className="px-2 py-1 text-xs rounded bg-blue-600 text-white hover:bg-blue-500 flex items-center gap-1">
                      <Save className="w-3 h-3" /> Sauvegarder
                    </button>
                  </div>
                </div>
                <textarea
                  value={editContent}
                  onChange={e => setEditContent(e.target.value)}
                  className="w-full h-64 bg-gray-950 text-gray-200 font-mono text-xs p-3 rounded border border-gray-800 resize-none focus:outline-none focus:border-blue-800"
                  spellCheck={false}
                />
              </div>
            ) : sel ? (
              (() => {
                const f = files.find(x => x.path === sel);
                if (!f) return null;
                return (
                  <div>
                    <div className="flex items-center justify-between mb-2 pb-2 border-b border-gray-800">
                      <FileCode className={"w-4 h-4 " + langColor(f.path)} />
                      <span className="text-sm font-mono text-gray-300">{f.path}</span>
                      <div className="flex gap-1">
                        <button onClick={() => { setEditing(f.path); setEditContent(f.content); }}
                          className="p-1 hover:bg-gray-800 text-gray-500 hover:text-blue-400"><Edit3 className="w-3.5 h-3.5" /></button>
                        <button onClick={() => navigator.clipboard?.writeText(f.content)}
                          className="p-1 hover:bg-gray-800 text-gray-500"><Copy className="w-3.5 h-3.5" /></button>
                      </div>
                    </div>
                    <pre className="font-mono text-xs text-gray-300 whitespace-pre-wrap">{f.content || "/* Vide */"}</pre>
                  </div>
                );
              })()
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-gray-600">
                <FileCode className="w-12 h-12 mb-3 opacity-20" />
                <p className="text-sm">Selectionnez un fichier ou tapez <span className="font-mono text-blue-500">create</span></p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Barre de statut */}
      <div className="flex items-center justify-between px-4 py-1 bg-gray-800 border-t border-gray-700 text-[10px] text-gray-500">
        <span className="inline-flex items-center gap-1">
          <span className={"inline-block w-1.5 h-1.5 rounded-full " + (running ? "bg-yellow-500 animate-pulse" : "bg-green-500")} />
          {running ? "Execution" : sudoDialog ? "Confirmation requise" : "Pret"}
        </span>
        <span className="flex items-center gap-3">
          {suggestions.length > 0 && <span className="text-blue-500">~{suggestions.length}</span>}
          <span>Cmd: {history.length}</span>
          <span>Fichiers: {files.length}</span>
        </span>
      </div>
    </div>
  );
}
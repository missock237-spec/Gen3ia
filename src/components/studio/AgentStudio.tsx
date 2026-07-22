"use client";
import React, { useState, useCallback } from "react";
import { ReactFlow, Background, Controls, MiniMap, useNodesState, useEdgesState, MarkerType } from "reactflow";
import "reactflow/dist/style.css";

const COLORS = { planner: "#6366f1", researcher: "#22c55e", executor: "#f59e0b", critic: "#ef4444", coordinator: "#8b5cf6" };
const EMOJIS = { planner: "📋", researcher: "🔍", executor: "⚡", critic: "✅", coordinator: "🎯" };

const INITIAL_NODES = [
  { id: "user-input", type: "input", position: { x: 250, y: 0 }, data: { label: "Requete utilisateur" } },
  { id: "coordinator", position: { x: 250, y: 100 }, data: { label: "🎯 Coordinateur" }, style: { background: "#8b5cf6", color: "#fff", borderRadius: "12px", padding: "12px 20px", fontWeight: 600 } },
  { id: "planner", position: { x: 50, y: 220 }, data: { label: "📋 Planner" }, style: { background: "#6366f1", color: "#fff", borderRadius: "12px", padding: "12px 20px", fontWeight: 600 } },
  { id: "researcher", position: { x: 250, y: 220 }, data: { label: "🔍 Researcher" }, style: { background: "#22c55e", color: "#fff", borderRadius: "12px", padding: "12px 20px", fontWeight: 600 } },
  { id: "executor", position: { x: 450, y: 220 }, data: { label: "⚡ Executor" }, style: { background: "#f59e0b", color: "#fff", borderRadius: "12px", padding: "12px 20px", fontWeight: 600 } },
  { id: "critic", position: { x: 250, y: 340 }, data: { label: "✅ Critic" }, style: { background: "#ef4444", color: "#fff", borderRadius: "12px", padding: "12px 20px", fontWeight: 600 } },
  { id: "output", type: "output", position: { x: 250, y: 450 }, data: { label: "Resultat final" }, style: { background: "#1e293b", color: "#fff", borderRadius: "12px", padding: "12px 20px", fontWeight: 600 } },
];

const INITIAL_EDGES = [
  { id: "e1", source: "user-input", target: "coordinator", animated: true, style: { stroke: "#8b5cf6", strokeWidth: 2 }, markerEnd: { type: MarkerType.ArrowClosed } },
  { id: "e2", source: "coordinator", target: "planner", animated: true, style: { stroke: "#6366f1", strokeWidth: 2 }, markerEnd: { type: MarkerType.ArrowClosed } },
  { id: "e3", source: "coordinator", target: "researcher", animated: true, style: { stroke: "#22c55e", strokeWidth: 2 }, markerEnd: { type: MarkerType.ArrowClosed } },
  { id: "e4", source: "coordinator", target: "executor", animated: true, style: { stroke: "#f59e0b", strokeWidth: 2 }, markerEnd: { type: MarkerType.ArrowClosed } },
  { id: "e5", source: "planner", target: "critic", style: { stroke: "#6366f1", strokeWidth: 1.5, strokeDasharray: "5 5" }, markerEnd: { type: MarkerType.ArrowClosed } },
  { id: "e6", source: "researcher", target: "critic", style: { stroke: "#22c55e", strokeWidth: 1.5, strokeDasharray: "5 5" }, markerEnd: { type: MarkerType.ArrowClosed } },
  { id: "e7", source: "executor", target: "critic", style: { stroke: "#f59e0b", strokeWidth: 1.5, strokeDasharray: "5 5" }, markerEnd: { type: MarkerType.ArrowClosed } },
  { id: "e8", source: "critic", target: "output", animated: true, style: { stroke: "#ef4444", strokeWidth: 2 }, markerEnd: { type: MarkerType.ArrowClosed } },
];

export default function AgentStudio() {
  const [nodes, setNodes, onNodesChange] = useNodesState(INITIAL_NODES);
  const [edges, , onEdgesChange] = useEdgesState(INITIAL_EDGES);
  const [logs, setLogs] = useState(["Studio pret."]);
  const [isRunning, setIsRunning] = useState(false);

  const run = async () => {
    setIsRunning(true);
    setLogs(p => [...p, "[Lancement orchestration...]"]);
    try {
      const r = await fetch("/api/agents/roles/run", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ task: "Demo studio", agents: [
        { id: "a1", name: "Plan", role: "planner" }, { id: "a2", name: "Search", role: "researcher" },
        { id: "a3", name: "Exec", role: "executor" }, { id: "a4", name: "Review", role: "critic" },
        { id: "a5", name: "Coord", role: "coordinator" } ], userId: "studio" }) });
      const d = await r.json();
      setLogs(p => [...p, "[Termine: " + (d.mission?.duration || "?") + "ms]"]);
    } catch (e) { setLogs(p => [...p, "[Erreur: " + e.message + "]"]); }
    setIsRunning(false);
  };

  const addAgent = () => {
    const roles = ["planner", "researcher", "executor", "critic"];
    const role = roles[Math.floor(Math.random() * roles.length)];
    setNodes(nds => [...nds, { id: "n" + Date.now(), position: { x: Math.random() * 400 + 50, y: Math.random() * 200 + 150 }, data: { label: EMOJIS[role] + " " + role.charAt(0).toUpperCase() + role.slice(1) }, style: { background: COLORS[role], color: "#fff", borderRadius: "12px", padding: "10px 16px", fontWeight: 600 } }]);
    setLogs(p => [...p, "[Agent ajoute: " + role + "]"]);
  };

  return (
    <div className="flex h-[calc(100vh-4rem)] bg-gray-950">
      <div className="w-64 bg-gray-900 border-r border-gray-800 p-4 overflow-y-auto">
        <h2 className="text-sm font-bold text-gray-200 mb-4">Agent Studio</h2>
        <div className="space-y-2">
          <button onClick={addAgent} disabled={isRunning} className="w-full px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm transition">+ Agent</button>
          <button onClick={run} disabled={isRunning} className="w-full px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-xl text-sm transition">{isRunning ? "..." : "Lancer"}</button>
          <button onClick={() => setNodes(INITIAL_NODES)} className="w-full px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-xl text-sm transition">Reset</button>
        </div>
        <div className="mt-6">{Object.entries(COLORS).map(([role, color]) => (
          <div key={role} className="flex items-center gap-2 p-2 text-sm text-gray-300"><div className="w-3 h-3 rounded-full" style={{ background: color }} />{EMOJIS[role]} {role}</div>
        ))}</div>
      </div>
      <div className="flex-1">
        <ReactFlow nodes={nodes} edges={edges} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} fitView>
          <Background color="#1f2937" gap={20} />
          <Controls className="bg-gray-800 border-gray-700 rounded-xl" />
          <MiniMap nodeColor={(n) => COLORS[n.data?.label?.split(" ")[1]?.toLowerCase()] || "#374151"} className="bg-gray-800 border-gray-700 rounded-xl" />
        </ReactFlow>
      </div>
      <div className="w-72 bg-gray-900 border-l border-gray-800 p-4 overflow-y-auto">
        <h3 className="text-xs text-gray-500 font-semibold mb-2">Console</h3>
        {logs.map((l, i) => <div key={i} className="text-xs font-mono text-gray-400 py-0.5">{l}</div>)}
      </div>
    </div>
  );
}

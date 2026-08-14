'use client';

import React, { useCallback } from 'react';
import ReactFlow, {
  Node,
  Edge,
  addEdge,
  useNodesState,
  useEdgesState,
  Background,
  Controls,
  MiniMap,
  BackgroundVariant,
  Position,
  NodeProps,
} from 'reactflow';
import 'reactflow/dist/style.css';

// --- Custom node ---
function AgentNode({ data }: NodeProps) {
  return (
    <div className="rounded-lg border bg-card px-4 py-3 shadow-md text-center min-w-[140px]">
      <div className="text-sm font-semibold text-foreground">{data.label}</div>
      {data.description && (
        <div className="text-xs text-muted-foreground mt-1">{data.description}</div>
      )}
      {data.badge && (
        <span className="inline-block mt-2 text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
          {data.badge}
        </span>
      )}
    </div>
  );
}

const nodeTypes = { agent: AgentNode };

const initialNodes: Node[] = [
  {
    id: 'input',
    type: 'agent',
    position: { x: 250, y: 0 },
    data: { label: 'Input Utilisateur', description: 'Prompt / Message', badge: 'Entry' },
    sourcePosition: Position.Right,
  },
  {
    id: 'router',
    type: 'agent',
    position: { x: 250, y: 120 },
    data: { label: 'AI Router', description: 'Sélection du modèle', badge: 'Core' },
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
  },
  {
    id: 'react',
    type: 'agent',
    position: { x: 80, y: 260 },
    data: { label: 'ReAct Loop', description: 'Think → Act → Observe', badge: 'Engine' },
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
  },
  {
    id: 'safety',
    type: 'agent',
    position: { x: 420, y: 260 },
    data: { label: 'Safety Check', description: 'Injection + Jailbreak', badge: 'Guard' },
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
  },
  {
    id: 'sandbox',
    type: 'agent',
    position: { x: 80, y: 400 },
    data: { label: 'Code Sandbox', description: 'isolated-vm 128MB', badge: 'Exec' },
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
  },
  {
    id: 'supervisor',
    type: 'agent',
    position: { x: 250, y: 400 },
    data: { label: 'Supervisor', description: 'Coût, qualité, stagnation', badge: 'Monitor' },
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
  },
  {
    id: 'output',
    type: 'agent',
    position: { x: 250, y: 540 },
    data: { label: 'Response', description: 'Résultat formaté', badge: 'Exit' },
    targetPosition: Position.Left,
  },
];

const initialEdges: Edge[] = [
  { id: 'e-input-router', source: 'input', target: 'router', animated: true },
  { id: 'e-router-react', source: 'router', target: 'react' },
  { id: 'e-router-safety', source: 'router', target: 'safety' },
  { id: 'e-react-sandbox', source: 'react', target: 'sandbox', animated: true },
  { id: 'e-react-supervisor', source: 'react', target: 'supervisor' },
  { id: 'e-safety-supervisor', source: 'safety', target: 'supervisor' },
  { id: 'e-supervisor-output', source: 'supervisor', target: 'output', animated: true },
  { id: 'e-react-output', source: 'react', target: 'output' },
];

export function AgentFlow() {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const onConnect = useCallback((params: any) => setEdges((eds) => addEdge(params, eds)), [setEdges]);

  return (
    <div style={{ height: 500 }} className="rounded-xl border bg-card overflow-hidden">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        nodeTypes={nodeTypes}
        fitView
        attributionPosition="bottom-left"
      >
        <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
        <Controls />
        <MiniMap
          nodeColor={(n) => {
            if (n.data?.badge === 'Entry') return '#10b981';
            if (n.data?.badge === 'Exit') return '#f59e0b';
            if (n.data?.badge === 'Guard') return '#ef4444';
            return '#6366f1';
          }}
          className="!bg-background !border"
        />
      </ReactFlow>
    </div>
  );
}

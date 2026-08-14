'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  AgentRun,
  DebugStep,
  StepType,
  StepStatus,
} from '@/lib/agent-debug';
import {
  Play,
  RotateCcw,
  Download,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  Cpu,
  Wrench,
  User,
  GitBranch,
  Activity,
  Terminal,
  RefreshCw,
  GitCompare,
  Plus,
  ChevronRight,
  ChevronDown,
  Copy,
  Check,
  Code,
  Sparkles,
} from 'lucide-react';

interface DebugReplayStudioProps {
  agentId: string;
  userId: string;
}

export function DebugReplayStudio({ agentId, userId }: DebugReplayStudioProps) {
  const [runs, setRuns] = useState<AgentRun[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'timeline' | 'diff' | 'replay'>('timeline');

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Diff tab states
  const [diffRunId1, setDiffRunId1] = useState<string | null>(null);
  const [diffRunId2, setDiffRunId2] = useState<string | null>(null);

  // Replay configurator states
  const [replayStepId, setReplayStepId] = useState<string | null>(null);
  const [modifiedInputJson, setModifiedInputJson] = useState<string>('{}');
  const [stopAtStepId, setStopAtStepId] = useState<string>('');
  const [isReplaying, setIsReplaying] = useState<boolean>(false);
  const [replaySuccessMsg, setReplaySuccessMsg] = useState<string | null>(null);

  // Export states
  const [copiedFormat, setCopiedFormat] = useState<'json' | 'markdown' | null>(null);

  // Expanded card toggle in timeline
  const [expandedSteps, setExpandedSteps] = useState<Record<string, boolean>>({});

  const fetchRuns = async () => {
    try {
      setIsRefreshing(true);
      setError(null);
      const res = await fetch(`/api/agent-debug?agentId=${encodeURIComponent(agentId)}&userId=${encodeURIComponent(userId)}`);
      if (!res.ok) {
        throw new Error('Failed to fetch runs');
      }
      const data: AgentRun[] = await res.json();
      setRuns(data);

      if (data.length > 0) {
        if (!selectedRunId || !data.some(r => r.id === selectedRunId)) {
          setSelectedRunId(data[0].id);
          if (data[0].steps.length > 0) {
            setSelectedStepId(data[0].steps[0].id);
          }
        }
        if (!diffRunId1) setDiffRunId1(data[0].id);
        if (!diffRunId2 && data.length > 1) setDiffRunId2(data[1].id);
      }
    } catch (err: any) {
      setError(err?.message || 'Error loading agent debug runs');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchRuns();
  }, [agentId, userId]);

  const selectedRun = useMemo(() => {
    return runs.find((r) => r.id === selectedRunId) || null;
  }, [runs, selectedRunId]);

  const selectedStep = useMemo(() => {
    if (!selectedRun) return null;
    return selectedRun.steps.find((s) => s.id === selectedStepId) || null;
  }, [selectedRun, selectedStepId]);

  const run1ForDiff = useMemo(() => runs.find((r) => r.id === diffRunId1) || null, [runs, diffRunId1]);
  const run2ForDiff = useMemo(() => runs.find((r) => r.id === diffRunId2) || null, [runs, diffRunId2]);

  const diffResult = useMemo(() => {
    if (!run1ForDiff || !run2ForDiff) return null;

    const addedSteps: DebugStep[] = [];
    const removedSteps: DebugStep[] = [];
    const modifiedSteps: { original: DebugStep; modified: DebugStep }[] = [];

    const maxLen = Math.max(run1ForDiff.steps.length, run2ForDiff.steps.length);
    for (let i = 0; i < maxLen; i++) {
      const s1 = run1ForDiff.steps[i];
      const s2 = run2ForDiff.steps[i];

      if (s1 && s2) {
        const s1In = JSON.stringify(s1.inputData);
        const s2In = JSON.stringify(s2.inputData);
        const s1Out = JSON.stringify(s1.outputData);
        const s2Out = JSON.stringify(s2.outputData);

        if (s1.type !== s2.type || s1.status !== s2.status || s1In !== s2In || s1Out !== s2Out) {
          modifiedSteps.push({ original: s1, modified: s2 });
        }
      } else if (s2 && !s1) {
        addedSteps.push(s2);
      } else if (s1 && !s2) {
        removedSteps.push(s1);
      }
    }

    return { addedSteps, removedSteps, modifiedSteps };
  }, [run1ForDiff, run2ForDiff]);

  const handleStartNewRun = async () => {
    try {
      setIsRefreshing(true);
      const res = await fetch('/api/agent-debug', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId, userId }),
      });
      if (!res.ok) throw new Error('Failed to start new run');
      const data = await res.json();
      await fetchRuns();
      if (data.runId) {
        setSelectedRunId(data.runId);
      }
    } catch (err: any) {
      alert(err.message || 'Could not start new run');
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleSelectReplayStep = (step: DebugStep) => {
    setReplayStepId(step.id);
    setModifiedInputJson(JSON.stringify(step.inputData, null, 2));
    setActiveTab('replay');
  };

  const handleExecuteReplay = async () => {
    if (!selectedRunId) return;
    try {
      setIsReplaying(true);
      setError(null);

      let parsedInput: Record<string, unknown> = {};
      try {
        parsedInput = JSON.parse(modifiedInputJson);
      } catch {
        alert('Invalid JSON input format. Please fix formatting before replaying.');
        setIsReplaying(false);
        return;
      }

      const modifiedSteps = replayStepId
        ? [{ stepId: replayStepId, newInput: parsedInput }]
        : [];

      const res = await fetch(`/api/agent-debug/${encodeURIComponent(selectedRunId)}/replay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          modifiedSteps,
          stopAtStepId: stopAtStepId || undefined,
        }),
      });

      if (!res.ok) throw new Error('Replay failed');
      const newRun: AgentRun = await res.json();

      await fetchRuns();
      setSelectedRunId(newRun.id);
      if (newRun.steps.length > 0) {
        setSelectedStepId(newRun.steps[0].id);
      }
      setReplaySuccessMsg(`Replayed successfully! Created simulated run ${newRun.id}`);
      setActiveTab('timeline');
    } catch (err: any) {
      setError(err?.message || 'Failed to execute replay');
    } finally {
      setIsReplaying(false);
    }
  };

  const handleExport = async (format: 'json' | 'markdown') => {
    if (!selectedRunId) return;
    try {
      const res = await fetch(`/api/agent-debug/${encodeURIComponent(selectedRunId)}?format=${format}`);
      const text = await res.text();

      await navigator.clipboard.writeText(text);
      setCopiedFormat(format);
      setTimeout(() => setCopiedFormat(null), 2500);
    } catch (err) {
      alert('Failed to copy exported run trace to clipboard');
    }
  };

  const toggleExpandStep = (stepId: string) => {
    setExpandedSteps((prev) => ({ ...prev, [stepId]: !prev[stepId] }));
  };

  const getStepIcon = (type: StepType) => {
    switch (type) {
      case StepType.USER_INPUT:
        return <User className="w-4 h-4 text-blue-500" />;
      case StepType.LLM_CALL:
        return <Cpu className="w-4 h-4 text-purple-500" />;
      case StepType.TOOL_CALL:
        return <Wrench className="w-4 h-4 text-amber-500" />;
      case StepType.TOOL_RESULT:
        return <Terminal className="w-4 h-4 text-teal-500" />;
      case StepType.AGENT_DECISION:
        return <GitBranch className="w-4 h-4 text-indigo-500" />;
      case StepType.ERROR:
        return <AlertTriangle className="w-4 h-4 text-destructive" />;
      case StepType.SYSTEM_EVENT:
        return <Activity className="w-4 h-4 text-muted-foreground" />;
      default:
        return <Code className="w-4 h-4 text-muted-foreground" />;
    }
  };

  const getStatusBadge = (status: StepStatus) => {
    switch (status) {
      case StepStatus.SUCCESS:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
            <CheckCircle2 className="w-3 h-3" /> SUCCESS
          </span>
        );
      case StepStatus.FAILURE:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-destructive/15 text-destructive border border-destructive/30">
            <XCircle className="w-3 h-3" /> FAILURE
          </span>
        );
      case StepStatus.TIMEOUT:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30">
            <Clock className="w-3 h-3" /> TIMEOUT
          </span>
        );
      case StepStatus.SKIPPED:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-secondary text-secondary-foreground border border-border">
            SKIPPED
          </span>
        );
    }
  };

  return (
    <div className="w-full max-w-7xl mx-auto p-4 space-y-6 text-foreground font-sans">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 bg-card border border-border rounded-xl shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            <h1 className="text-xl font-bold tracking-tight">Agent Debug & Replay Studio</h1>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Visual timeline, step execution inspection, and run replay simulator
          </p>
          <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
            <span>Agent: <code className="bg-secondary px-1.5 py-0.5 rounded font-mono text-foreground">{agentId}</code></span>
            <span>User: <code className="bg-secondary px-1.5 py-0.5 rounded font-mono text-foreground">{userId}</code></span>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={fetchRuns}
            disabled={isRefreshing}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-secondary hover:bg-secondary/80 text-secondary-foreground border border-border transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>

          <button
            onClick={handleStartNewRun}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            New Debug Run
          </button>

          <div className="inline-flex items-center gap-1 bg-secondary/50 p-1 rounded-md border border-border">
            <button
              onClick={() => handleExport('json')}
              disabled={!selectedRun}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded hover:bg-card text-foreground transition-colors disabled:opacity-40"
            >
              {copiedFormat === 'json' ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Download className="w-3.5 h-3.5" />}
              JSON
            </button>
            <button
              onClick={() => handleExport('markdown')}
              disabled={!selectedRun}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded hover:bg-card text-foreground transition-colors disabled:opacity-40"
            >
              {copiedFormat === 'markdown' ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Download className="w-3.5 h-3.5" />}
              Markdown
            </button>
          </div>
        </div>
      </div>

      {replaySuccessMsg && (
        <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 text-sm rounded-lg flex items-center justify-between">
          <span>{replaySuccessMsg}</span>
          <button onClick={() => setReplaySuccessMsg(null)} className="text-xs underline hover:opacity-80">
            Dismiss
          </button>
        </div>
      )}

      {error && (
        <div className="p-3 bg-destructive/10 border border-destructive/30 text-destructive text-sm rounded-lg">
          {error}
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-border space-x-6">
        <button
          onClick={() => setActiveTab('timeline')}
          className={`pb-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === 'timeline'
              ? 'border-primary text-primary font-semibold'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <Activity className="w-4 h-4" /> Timeline View
        </button>
        <button
          onClick={() => setActiveTab('diff')}
          className={`pb-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === 'diff'
              ? 'border-primary text-primary font-semibold'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <GitCompare className="w-4 h-4" /> Diff Runs
        </button>
        <button
          onClick={() => setActiveTab('replay')}
          className={`pb-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === 'replay'
              ? 'border-primary text-primary font-semibold'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <RotateCcw className="w-4 h-4" /> Replay Configurator
        </button>
      </div>

      {/* Tab 1: Timeline View */}
      {activeTab === 'timeline' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Run Selector & Overview */}
          <div className="lg:col-span-4 space-y-4">
            <div className="p-4 bg-card border border-border rounded-xl space-y-3">
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Select Debug Run
              </label>
              <select
                value={selectedRunId || ''}
                onChange={(e) => {
                  setSelectedRunId(e.target.value);
                  const run = runs.find((r) => r.id === e.target.value);
                  if (run && run.steps.length > 0) {
                    setSelectedStepId(run.steps[0].id);
                  }
                }}
                className="w-full bg-secondary border border-border rounded-lg p-2 text-sm text-foreground focus:ring-1 focus:ring-primary focus:outline-hidden"
              >
                {runs.length === 0 && <option value="">No runs available</option>}
                {runs.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.id} ({r.status.toUpperCase()}) — {r.totalSteps} steps
                  </option>
                ))}
              </select>

              {selectedRun ? (
                <div className="space-y-2 pt-2 border-t border-border text-xs text-muted-foreground">
                  <div className="flex justify-between py-1">
                    <span>Status:</span>
                    <span className={`font-semibold ${
                      selectedRun.status === 'completed' ? 'text-emerald-500' : selectedRun.status === 'failed' ? 'text-destructive' : 'text-amber-500'
                    }`}>
                      {selectedRun.status.toUpperCase()}
                    </span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span>Started:</span>
                    <span className="font-mono text-foreground">{new Date(selectedRun.startedAt).toLocaleTimeString()}</span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span>Total Steps:</span>
                    <span className="font-medium text-foreground">{selectedRun.totalSteps}</span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span>Est. Cost:</span>
                    <span className="font-mono text-foreground">${selectedRun.totalCost.toFixed(5)}</span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span>Conversation:</span>
                    <span className="font-mono text-foreground truncate max-w-[150px]">{selectedRun.conversationId}</span>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground italic">No run selected</p>
              )}
            </div>

            {/* Step list summary selector */}
            {selectedRun && (
              <div className="p-4 bg-card border border-border rounded-xl space-y-2">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Run Steps
                </h3>
                <div className="space-y-1 max-h-[400px] overflow-y-auto pr-1">
                  {selectedRun.steps.map((step, idx) => (
                    <button
                      key={step.id}
                      onClick={() => setSelectedStepId(step.id)}
                      className={`w-full text-left p-2.5 rounded-lg border transition-all flex items-center justify-between ${
                        selectedStepId === step.id
                          ? 'bg-primary/10 border-primary text-foreground'
                          : 'bg-secondary/40 hover:bg-secondary border-border text-muted-foreground'
                      }`}
                    >
                      <div className="flex items-center gap-2 overflow-hidden">
                        {getStepIcon(step.type)}
                        <span className="text-xs font-medium truncate">
                          {idx + 1}. {step.type}
                        </span>
                      </div>
                      <span className="text-[10px] font-mono opacity-80">{step.duration}ms</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right Column: Timeline & Step Details */}
          <div className="lg:col-span-8 space-y-4">
            {isLoading ? (
              <div className="p-12 text-center text-muted-foreground bg-card border border-border rounded-xl">
                <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 opacity-50" />
                Loading execution trace...
              </div>
            ) : !selectedRun ? (
              <div className="p-12 text-center text-muted-foreground bg-card border border-border rounded-xl">
                No debug run selected. Create or select a run to view execution steps.
              </div>
            ) : (
              <div className="space-y-4">
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                  <span>Execution Timeline ({selectedRun.steps.length} steps)</span>
                </h2>

                <div className="relative border-l-2 border-border ml-4 pl-6 space-y-6 py-2">
                  {selectedRun.steps.map((step, index) => {
                    const isSelected = selectedStepId === step.id;
                    const isExpanded = !!expandedSteps[step.id] || isSelected;

                    return (
                      <div key={step.id} className="relative group">
                        {/* Timeline dot */}
                        <div className={`absolute -left-[31px] top-3 w-4 h-4 rounded-full border-2 bg-card flex items-center justify-center ${
                          step.status === StepStatus.SUCCESS
                            ? 'border-emerald-500'
                            : step.status === StepStatus.FAILURE
                            ? 'border-destructive'
                            : 'border-amber-500'
                        }`} />

                        <div className={`p-4 rounded-xl border transition-all bg-card ${
                          isSelected ? 'border-primary ring-1 ring-primary/30 shadow-xs' : 'border-border hover:border-border/80'
                        }`}>
                          <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-border/50">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-mono text-muted-foreground">#{index + 1}</span>
                              <div className="p-1 rounded bg-secondary">
                                {getStepIcon(step.type)}
                              </div>
                              <span className="font-semibold text-sm">{step.type}</span>
                              {getStatusBadge(step.status)}
                            </div>

                            <div className="flex items-center gap-3 text-xs text-muted-foreground">
                              <span className="flex items-center gap-1 font-mono">
                                <Clock className="w-3 h-3" /> {step.duration}ms
                              </span>
                              {step.model && (
                                <span className="bg-secondary px-2 py-0.5 rounded text-[11px] font-mono text-foreground">
                                  {step.model}
                                </span>
                              )}
                              <button
                                onClick={() => handleSelectReplayStep(step)}
                                className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded bg-secondary hover:bg-primary/20 hover:text-primary transition-colors text-foreground"
                                title="Replay from this step with modified inputs"
                              >
                                <RotateCcw className="w-3 h-3" /> Replay
                              </button>
                              <button
                                onClick={() => toggleExpandStep(step.id)}
                                className="p-1 hover:bg-secondary rounded text-muted-foreground"
                              >
                                {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                              </button>
                            </div>
                          </div>

                          {/* Quick info badges */}
                          {step.tokensUsed && (
                            <div className="mt-2 text-xs text-muted-foreground flex items-center gap-3 font-mono">
                              <span>Tokens: In {step.tokensUsed.input} / Out {step.tokensUsed.output}</span>
                            </div>
                          )}

                          {step.errorMessage && (
                            <div className="mt-2 p-2 rounded bg-destructive/10 border border-destructive/20 text-destructive text-xs font-mono">
                              Error: {step.errorMessage}
                            </div>
                          )}

                          {/* Expanded JSON Inspector */}
                          {isExpanded && (
                            <div className="mt-4 space-y-3 pt-3 border-t border-border">
                              <div>
                                <span className="text-xs font-semibold text-muted-foreground uppercase">Input Data</span>
                                <pre className="mt-1 p-3 bg-secondary/80 rounded-lg text-xs font-mono overflow-x-auto text-foreground border border-border">
                                  {JSON.stringify(step.inputData, null, 2)}
                                </pre>
                              </div>

                              <div>
                                <span className="text-xs font-semibold text-muted-foreground uppercase">Output Data</span>
                                <pre className="mt-1 p-3 bg-secondary/80 rounded-lg text-xs font-mono overflow-x-auto text-foreground border border-border">
                                  {JSON.stringify(step.outputData, null, 2)}
                                </pre>
                              </div>

                              {step.metadata && Object.keys(step.metadata).length > 0 && (
                                <div>
                                  <span className="text-xs font-semibold text-muted-foreground uppercase">Metadata</span>
                                  <pre className="mt-1 p-2 bg-secondary/40 rounded text-[11px] font-mono overflow-x-auto text-muted-foreground">
                                    {JSON.stringify(step.metadata, null, 2)}
                                  </pre>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 2: Diff View */}
      {activeTab === 'diff' && (
        <div className="space-y-6">
          <div className="p-4 bg-card border border-border rounded-xl space-y-4">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              Compare Two Execution Runs
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">
                  Run 1 (Base Run)
                </label>
                <select
                  value={diffRunId1 || ''}
                  onChange={(e) => setDiffRunId1(e.target.value)}
                  className="w-full bg-secondary border border-border rounded-lg p-2 text-sm text-foreground"
                >
                  <option value="">Select first run</option>
                  {runs.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.id} ({r.status}) — {r.totalSteps} steps
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">
                  Run 2 (Compared Run)
                </label>
                <select
                  value={diffRunId2 || ''}
                  onChange={(e) => setDiffRunId2(e.target.value)}
                  className="w-full bg-secondary border border-border rounded-lg p-2 text-sm text-foreground"
                >
                  <option value="">Select second run</option>
                  {runs.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.id} ({r.status}) — {r.totalSteps} steps
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {diffResult ? (
            <div className="space-y-4">
              {/* Summary Stats */}
              <div className="grid grid-cols-3 gap-4 text-center">
                <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
                  <div className="text-lg font-bold text-emerald-500">{diffResult.addedSteps.length}</div>
                  <div className="text-xs text-muted-foreground">Added Steps</div>
                </div>
                <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-xl">
                  <div className="text-lg font-bold text-destructive">{diffResult.removedSteps.length}</div>
                  <div className="text-xs text-muted-foreground">Removed Steps</div>
                </div>
                <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl">
                  <div className="text-lg font-bold text-amber-500">{diffResult.modifiedSteps.length}</div>
                  <div className="text-xs text-muted-foreground">Modified Steps</div>
                </div>
              </div>

              {/* Modified steps comparison */}
              {diffResult.modifiedSteps.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Modified Steps ({diffResult.modifiedSteps.length})
                  </h3>
                  {diffResult.modifiedSteps.map(({ original, modified }, idx) => (
                    <div key={idx} className="p-4 bg-card border border-border rounded-xl space-y-3">
                      <div className="flex items-center justify-between text-xs font-semibold">
                        <span className="text-foreground">Step #{idx + 1}: {original.type}</span>
                        <span className="text-muted-foreground">ID: {original.id} → {modified.id}</span>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono">
                        <div className="p-3 bg-secondary/50 rounded-lg border border-border space-y-1">
                          <div className="text-muted-foreground font-sans font-semibold border-b border-border pb-1">Run 1 Input/Output</div>
                          <div className="text-xs text-muted-foreground pt-1">Input:</div>
                          <pre className="overflow-x-auto text-[11px]">{JSON.stringify(original.inputData, null, 2)}</pre>
                          <div className="text-xs text-muted-foreground pt-1">Output:</div>
                          <pre className="overflow-x-auto text-[11px]">{JSON.stringify(original.outputData, null, 2)}</pre>
                        </div>

                        <div className="p-3 bg-secondary/50 rounded-lg border border-border space-y-1">
                          <div className="text-primary font-sans font-semibold border-b border-border pb-1">Run 2 Input/Output</div>
                          <div className="text-xs text-muted-foreground pt-1">Input:</div>
                          <pre className="overflow-x-auto text-[11px] text-primary">{JSON.stringify(modified.inputData, null, 2)}</pre>
                          <div className="text-xs text-muted-foreground pt-1">Output:</div>
                          <pre className="overflow-x-auto text-[11px] text-primary">{JSON.stringify(modified.outputData, null, 2)}</pre>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Added steps */}
              {diffResult.addedSteps.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-xs font-semibold text-emerald-500 uppercase tracking-wider">
                    Added Steps in Run 2
                  </h3>
                  {diffResult.addedSteps.map((step) => (
                    <div key={step.id} className="p-3 bg-emerald-500/5 border border-emerald-500/20 rounded-lg text-xs">
                      <span className="font-bold">{step.type}</span> - {step.duration}ms
                    </div>
                  ))}
                </div>
              )}

              {/* Removed steps */}
              {diffResult.removedSteps.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-xs font-semibold text-destructive uppercase tracking-wider">
                    Removed Steps from Run 1
                  </h3>
                  {diffResult.removedSteps.map((step) => (
                    <div key={step.id} className="p-3 bg-destructive/5 border border-destructive/20 rounded-lg text-xs">
                      <span className="font-bold">{step.type}</span> - {step.duration}ms
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="p-8 text-center text-muted-foreground bg-card border border-border rounded-xl">
              Select two runs above to generate a diff trace.
            </div>
          )}
        </div>
      )}

      {/* Tab 3: Replay Configurator */}
      {activeTab === 'replay' && (
        <div className="p-6 bg-card border border-border rounded-xl space-y-6">
          <div>
            <h2 className="text-lg font-bold">Replay Engine Studio</h2>
            <p className="text-xs text-muted-foreground mt-1">
              Modify inputs for specific execution steps and simulate agent re-execution.
            </p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase mb-1">
                Target Base Run
              </label>
              <select
                value={selectedRunId || ''}
                onChange={(e) => setSelectedRunId(e.target.value)}
                className="w-full bg-secondary border border-border rounded-lg p-2 text-sm text-foreground"
              >
                {runs.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.id} ({r.status})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase mb-1">
                Select Step to Modify
              </label>
              <select
                value={replayStepId || ''}
                onChange={(e) => {
                  setReplayStepId(e.target.value);
                  const step = selectedRun?.steps.find((s) => s.id === e.target.value);
                  if (step) {
                    setModifiedInputJson(JSON.stringify(step.inputData, null, 2));
                  }
                }}
                className="w-full bg-secondary border border-border rounded-lg p-2 text-sm text-foreground"
              >
                <option value="">-- Replay whole run without step override --</option>
                {selectedRun?.steps.map((s, idx) => (
                  <option key={s.id} value={s.id}>
                    Step {idx + 1}: {s.type} ({s.id})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase mb-1">
                Modified Step Input (JSON)
              </label>
              <textarea
                rows={8}
                value={modifiedInputJson}
                onChange={(e) => setModifiedInputJson(e.target.value)}
                className="w-full bg-secondary font-mono text-xs border border-border rounded-lg p-3 text-foreground focus:ring-1 focus:ring-primary focus:outline-hidden"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase mb-1">
                Optional: Stop At Step ID
              </label>
              <input
                type="text"
                placeholder="e.g. step-2"
                value={stopAtStepId}
                onChange={(e) => setStopAtStepId(e.target.value)}
                className="w-full bg-secondary border border-border rounded-lg p-2 text-sm text-foreground"
              />
            </div>

            <div className="pt-2">
              <button
                onClick={handleExecuteReplay}
                disabled={isReplaying || !selectedRunId}
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground text-sm font-semibold rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {isReplaying ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Simulating Replay...
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4" />
                    Execute Replay
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default DebugReplayStudio;

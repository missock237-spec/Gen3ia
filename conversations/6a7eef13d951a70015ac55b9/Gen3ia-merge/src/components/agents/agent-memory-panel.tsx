'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Brain,
  Trash2,
  Edit2,
  Plus,
  Search,
  Tag,
  Clock,
  Sparkles,
  Check,
  X,
  Database,
  Cpu,
  RefreshCw,
} from 'lucide-react';
import {
  AgentMemory,
  MemoryCategory,
  MemoryTier,
} from '@/lib/agent-memory-system';

export interface AgentMemoryPanelProps {
  agentId: string;
  userId: string;
  className?: string;
}

export function AgentMemoryPanel({ agentId, userId, className = '' }: AgentMemoryPanelProps) {
  const [memories, setMemories] = useState<AgentMemory[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');

  // New Memory Modal State
  const [isAdding, setIsAdding] = useState<boolean>(false);
  const [newKey, setNewKey] = useState<string>('');
  const [newValue, setNewValue] = useState<string>('');
  const [newCategory, setNewCategory] = useState<MemoryCategory>(MemoryCategory.FACT);
  const [newTier, setNewTier] = useState<MemoryTier>(MemoryTier.PERSISTENT);
  const [newConfidence, setNewConfidence] = useState<number>(0.9);
  const [newTags, setNewTags] = useState<string>('');

  // Editing State
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editKey, setEditKey] = useState<string>('');
  const [editValue, setEditValue] = useState<string>('');
  const [editCategory, setEditCategory] = useState<MemoryCategory>(MemoryCategory.FACT);
  const [editTier, setEditTier] = useState<MemoryTier>(MemoryTier.PERSISTENT);
  const [editConfidence, setEditConfidence] = useState<number>(0.9);
  const [editTags, setEditTags] = useState<string>('');

  // Recall Test State
  const [recallTestMessage, setRecallTestMessage] = useState<string>('');
  const [isRecalling, setIsRecalling] = useState<boolean>(false);

  // Fetch memories
  const fetchMemories = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const url = `/api/agent-memory?agentId=${encodeURIComponent(agentId)}&userId=${encodeURIComponent(userId)}`;
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error('Failed to load memories');
      }
      const data = await res.json();
      if (data.memories) {
        setMemories(data.memories);
      }
    } catch (err: any) {
      setError(err?.message || 'Error fetching memories');
    } finally {
      setLoading(false);
    }
  }, [agentId, userId]);

  useEffect(() => {
    fetchMemories();
  }, [fetchMemories]);

  // Handle Create
  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKey.trim() || !newValue.trim()) return;

    try {
      const tagsArray = newTags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);

      const res = await fetch('/api/agent-memory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentId,
          userId,
          key: newKey.trim(),
          value: newValue.trim(),
          category: newCategory,
          tier: newTier,
          confidence: newConfidence,
          tags: tagsArray,
        }),
      });

      if (!res.ok) {
        throw new Error('Failed to create memory');
      }

      // Reset form
      setNewKey('');
      setNewValue('');
      setNewTags('');
      setIsAdding(false);
      fetchMemories();
    } catch (err: any) {
      setError(err?.message || 'Error creating memory');
    }
  };

  // Start Editing
  const startEdit = (memory: AgentMemory) => {
    setEditingId(memory.id);
    setEditKey(memory.key);
    setEditValue(memory.value);
    setEditCategory(memory.category);
    setEditTier(memory.tier);
    setEditConfidence(memory.confidence);
    setEditTags((memory.tags || []).join(', '));
  };

  // Save Edit
  const handleSaveEdit = async (id: string) => {
    try {
      const tagsArray = editTags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);

      const res = await fetch('/api/agent-memory', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id,
          updates: {
            key: editKey.trim(),
            value: editValue.trim(),
            category: editCategory,
            tier: editTier,
            confidence: editConfidence,
            tags: tagsArray,
          },
        }),
      });

      if (!res.ok) {
        throw new Error('Failed to update memory');
      }

      setEditingId(null);
      fetchMemories();
    } catch (err: any) {
      setError(err?.message || 'Error updating memory');
    }
  };

  // Handle Delete
  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this memory?')) return;

    try {
      const res = await fetch(`/api/agent-memory?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        throw new Error('Failed to delete memory');
      }

      fetchMemories();
    } catch (err: any) {
      setError(err?.message || 'Error deleting memory');
    }
  };

  // Test Prompt Recall
  const handleTestRecall = async () => {
    if (!recallTestMessage.trim()) return;

    setIsRecalling(true);
    try {
      const res = await fetch('/api/agent-memory/recall', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentId,
          userId,
          userMessage: recallTestMessage,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.memories) {
          setMemories(data.memories);
        }
      }
    } catch (err: any) {
      setError(err?.message || 'Error recalling memories');
    } finally {
      setIsRecalling(false);
    }
  };

  // Tier color styling helper
  const getTierBadgeClass = (tier: MemoryTier) => {
    switch (tier) {
      case MemoryTier.PERSISTENT:
        return 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30';
      case MemoryTier.SESSION:
        return 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30';
      case MemoryTier.EPHEMERAL:
        return 'bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30';
      default:
        return 'bg-secondary text-secondary-foreground border-border';
    }
  };

  // Category color styling helper
  const getCategoryBadgeClass = (category: MemoryCategory) => {
    switch (category) {
      case MemoryCategory.PREFERENCE:
        return 'bg-purple-500/15 text-purple-700 dark:text-purple-300 border-purple-500/30';
      case MemoryCategory.FACT:
        return 'bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30';
      case MemoryCategory.DECISION:
        return 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border-indigo-500/30';
      case MemoryCategory.CONTEXT:
        return 'bg-teal-500/15 text-teal-700 dark:text-teal-300 border-teal-500/30';
      case MemoryCategory.INSTRUCTION:
        return 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30';
      default:
        return 'bg-secondary text-secondary-foreground border-border';
    }
  };

  // Filter memories
  const filteredMemories = memories.filter((mem) => {
    const matchesCategory = selectedCategory === 'ALL' || mem.category === selectedCategory;
    const query = searchQuery.toLowerCase();
    const matchesSearch =
      !query ||
      mem.key.toLowerCase().includes(query) ||
      mem.value.toLowerCase().includes(query) ||
      (mem.tags && mem.tags.some((t) => t.toLowerCase().includes(query)));

    return matchesCategory && matchesSearch;
  });

  // Group by category
  const categoriesList = Object.values(MemoryCategory);
  const groupedMemories = categoriesList.reduce((acc, cat) => {
    acc[cat] = filteredMemories.filter((m) => m.category === cat);
    return acc;
  }, {} as Record<MemoryCategory, AgentMemory[]>);

  return (
    <div className={`flex flex-col gap-6 p-6 bg-card text-card-foreground rounded-xl border border-border shadow-sm ${className}`}>
      {/* Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-border pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-primary/10 text-primary">
            <Brain className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-xl font-semibold tracking-tight">Agent Memory System</h3>
            <p className="text-sm text-muted-foreground">
              Hierarchical memory persistence, decay scoring & auto-prompt injection
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => fetchMemories()}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium border border-border rounded-lg hover:bg-muted transition-colors"
            title="Refresh memories"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            onClick={() => setIsAdding(true)}
            className="flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" />
            Add Memory
          </button>
        </div>
      </div>

      {/* Error alert */}
      {error && (
        <div className="p-3 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-destructive hover:opacity-80">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Context Recall Tester */}
      <div className="p-4 bg-muted/40 border border-border rounded-lg flex flex-col gap-3">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          <Sparkles className="w-4 h-4 text-primary" />
          Test Context Recall & Scoring
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Type a test user message (e.g., 'What are my preferences for email formatting?')"
            value={recallTestMessage}
            onChange={(e) => setRecallTestMessage(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleTestRecall()}
            className="flex-1 px-3 py-2 text-sm bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <button
            onClick={handleTestRecall}
            disabled={isRecalling || !recallTestMessage.trim()}
            className="px-4 py-2 text-sm font-medium bg-secondary text-secondary-foreground hover:bg-secondary/80 rounded-md transition-colors disabled:opacity-50"
          >
            {isRecalling ? 'Scoring...' : 'Score Recall'}
          </button>
        </div>
      </div>

      {/* Search and Category Filter Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search memories by key, value, or tags..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm bg-background border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        {/* Category Pills */}
        <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0">
          <button
            onClick={() => setSelectedCategory('ALL')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-colors whitespace-nowrap ${
              selectedCategory === 'ALL'
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-background border-border text-muted-foreground hover:bg-muted'
            }`}
          >
            All ({memories.length})
          </button>
          {categoriesList.map((cat) => {
            const count = memories.filter((m) => m.category === cat).length;
            return (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-colors whitespace-nowrap ${
                  selectedCategory === cat
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-background border-border text-muted-foreground hover:bg-muted'
                }`}
              >
                {cat} ({count})
              </button>
            );
          })}
        </div>
      </div>

      {/* Add Memory Modal / Form */}
      {isAdding && (
        <form onSubmit={handleCreate} className="p-4 bg-muted/30 border border-primary/30 rounded-xl space-y-4">
          <div className="flex items-center justify-between border-b border-border pb-2">
            <h4 className="font-semibold text-sm flex items-center gap-2">
              <Plus className="w-4 h-4 text-primary" /> Store New Memory
            </h4>
            <button type="button" onClick={() => setIsAdding(false)} className="text-muted-foreground hover:text-foreground">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Key / Summary *</label>
              <input
                type="text"
                required
                placeholder="e.g. Preferred Output Format"
                value={newKey}
                onChange={(e) => setNewKey(e.target.value)}
                className="w-full px-3 py-1.5 text-sm bg-background border border-input rounded-md focus:ring-1 focus:ring-primary"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Category</label>
              <select
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value as MemoryCategory)}
                className="w-full px-3 py-1.5 text-sm bg-background border border-input rounded-md focus:ring-1 focus:ring-primary"
              >
                {Object.values(MemoryCategory).map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-muted-foreground mb-1">Value / Content *</label>
              <textarea
                required
                rows={2}
                placeholder="e.g. Always respond in markdown table format with bullet points"
                value={newValue}
                onChange={(e) => setNewValue(e.target.value)}
                className="w-full px-3 py-1.5 text-sm bg-background border border-input rounded-md focus:ring-1 focus:ring-primary"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Tier</label>
              <select
                value={newTier}
                onChange={(e) => setNewTier(e.target.value as MemoryTier)}
                className="w-full px-3 py-1.5 text-sm bg-background border border-input rounded-md focus:ring-1 focus:ring-primary"
              >
                <option value={MemoryTier.PERSISTENT}>PERSISTENT (Permanent across conversations)</option>
                <option value={MemoryTier.SESSION}>SESSION (Retained for current workflow session)</option>
                <option value={MemoryTier.EPHEMERAL}>EPHEMERAL (Short-lived context)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Confidence Score (0.0 - 1.0)</label>
              <input
                type="number"
                min="0"
                max="1"
                step="0.05"
                value={newConfidence}
                onChange={(e) => setNewConfidence(parseFloat(e.target.value))}
                className="w-full px-3 py-1.5 text-sm bg-background border border-input rounded-md focus:ring-1 focus:ring-primary"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-muted-foreground mb-1">Tags (comma-separated)</label>
              <input
                type="text"
                placeholder="e.g. formatting, style, rule"
                value={newTags}
                onChange={(e) => setNewTags(e.target.value)}
                className="w-full px-3 py-1.5 text-sm bg-background border border-input rounded-md focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setIsAdding(false)}
              className="px-3 py-1.5 text-xs font-medium border border-border rounded-md hover:bg-muted"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 text-xs font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
            >
              Save Memory
            </button>
          </div>
        </form>
      )}

      {/* Content Area */}
      {loading ? (
        <div className="py-12 flex flex-col items-center justify-center text-muted-foreground gap-2">
          <RefreshCw className="w-6 h-6 animate-spin text-primary" />
          <span className="text-sm">Loading memories...</span>
        </div>
      ) : filteredMemories.length === 0 ? (
        <div className="py-12 flex flex-col items-center justify-center border border-dashed border-border rounded-xl text-center p-6 gap-3">
          <Database className="w-10 h-10 text-muted-foreground/50" />
          <div>
            <p className="font-medium text-foreground">No memories found</p>
            <p className="text-sm text-muted-foreground">
              {searchQuery || selectedCategory !== 'ALL'
                ? 'Try adjusting your filters or search terms.'
                : 'Start storing user preferences, facts, and standing decisions for this agent.'}
            </p>
          </div>
          <button
            onClick={() => setIsAdding(true)}
            className="mt-1 px-4 py-1.5 text-xs font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90"
          >
            Create First Memory
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {categoriesList.map((category) => {
            const items = groupedMemories[category] || [];
            if (items.length === 0 && selectedCategory !== 'ALL') return null;
            if (items.length === 0) return null;

            return (
              <div key={category} className="space-y-3">
                <div className="flex items-center gap-2 border-b border-border pb-1.5">
                  <span className={`px-2 py-0.5 text-xs font-semibold rounded-md border ${getCategoryBadgeClass(category)}`}>
                    {category}
                  </span>
                  <span className="text-xs text-muted-foreground font-medium">({items.length})</span>
                </div>

                <div className="grid grid-cols-1 gap-3">
                  {items.map((mem) => {
                    const isEditing = editingId === mem.id;

                    if (isEditing) {
                      return (
                        <div key={mem.id} className="p-4 bg-muted/40 border border-primary/40 rounded-xl space-y-3">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div>
                              <label className="block text-xs font-medium text-muted-foreground mb-1">Key</label>
                              <input
                                type="text"
                                value={editKey}
                                onChange={(e) => setEditKey(e.target.value)}
                                className="w-full px-2.5 py-1 text-xs bg-background border border-input rounded-md"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-muted-foreground mb-1">Category</label>
                              <select
                                value={editCategory}
                                onChange={(e) => setEditCategory(e.target.value as MemoryCategory)}
                                className="w-full px-2.5 py-1 text-xs bg-background border border-input rounded-md"
                              >
                                {Object.values(MemoryCategory).map((cat) => (
                                  <option key={cat} value={cat}>
                                    {cat}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div className="md:col-span-2">
                              <label className="block text-xs font-medium text-muted-foreground mb-1">Value</label>
                              <textarea
                                rows={2}
                                value={editValue}
                                onChange={(e) => setEditValue(e.target.value)}
                                className="w-full px-2.5 py-1 text-xs bg-background border border-input rounded-md"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-muted-foreground mb-1">Tier</label>
                              <select
                                value={editTier}
                                onChange={(e) => setEditTier(e.target.value as MemoryTier)}
                                className="w-full px-2.5 py-1 text-xs bg-background border border-input rounded-md"
                              >
                                <option value={MemoryTier.PERSISTENT}>PERSISTENT</option>
                                <option value={MemoryTier.SESSION}>SESSION</option>
                                <option value={MemoryTier.EPHEMERAL}>EPHEMERAL</option>
                              </select>
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-muted-foreground mb-1">Confidence</label>
                              <input
                                type="number"
                                min="0"
                                max="1"
                                step="0.05"
                                value={editConfidence}
                                onChange={(e) => setEditConfidence(parseFloat(e.target.value))}
                                className="w-full px-2.5 py-1 text-xs bg-background border border-input rounded-md"
                              />
                            </div>
                            <div className="md:col-span-2">
                              <label className="block text-xs font-medium text-muted-foreground mb-1">Tags</label>
                              <input
                                type="text"
                                value={editTags}
                                onChange={(e) => setEditTags(e.target.value)}
                                className="w-full px-2.5 py-1 text-xs bg-background border border-input rounded-md"
                              />
                            </div>
                          </div>

                          <div className="flex justify-end gap-2 pt-1">
                            <button
                              onClick={() => setEditingId(null)}
                              className="px-2.5 py-1 text-xs border border-border rounded-md hover:bg-muted"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={() => handleSaveEdit(mem.id)}
                              className="px-3 py-1 text-xs bg-primary text-primary-foreground rounded-md hover:bg-primary/90 flex items-center gap-1"
                            >
                              <Check className="w-3.5 h-3.5" /> Save
                            </button>
                          </div>
                        </div>
                      );
                    }

                    return (
                      <div
                        key={mem.id}
                        className="p-4 bg-background border border-border rounded-xl hover:border-border/80 transition-all flex flex-col gap-2.5 shadow-2xs"
                      >
                        {/* Memory Header */}
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-sm text-foreground">{mem.key}</span>
                            <span className={`px-2 py-0.5 text-[10px] font-semibold uppercase rounded-md border ${getTierBadgeClass(mem.tier)}`}>
                              {mem.tier}
                            </span>
                            {typeof mem.relevanceScore === 'number' && (
                              <span
                                className={`px-2 py-0.5 text-[10px] font-medium rounded-md border ${
                                  mem.relevanceScore > 0.5
                                    ? 'bg-green-500/10 text-green-700 dark:text-green-300 border-green-500/20'
                                    : 'bg-muted text-muted-foreground border-border'
                                }`}
                              >
                                Score: {(mem.relevanceScore * 100).toFixed(0)}%
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-1 opacity-80 hover:opacity-100">
                            <button
                              onClick={() => startEdit(mem)}
                              className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors"
                              title="Edit memory"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDelete(mem.id)}
                              className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md transition-colors"
                              title="Delete memory"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        {/* Memory Body */}
                        <p className="text-sm text-foreground/90 bg-muted/30 p-2.5 rounded-lg border border-border/50 font-mono text-xs whitespace-pre-wrap leading-relaxed">
                          {mem.value}
                        </p>

                        {/* Footer & Meta Info */}
                        <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-xs text-muted-foreground">
                          {/* Tags */}
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <Tag className="w-3 h-3" />
                            {mem.tags && mem.tags.length > 0 ? (
                              mem.tags.map((tag, idx) => (
                                <span
                                  key={idx}
                                  className="px-1.5 py-0.5 bg-muted text-muted-foreground rounded text-[10px]"
                                >
                                  #{tag}
                                </span>
                              ))
                            ) : (
                              <span className="text-[10px] italic">no tags</span>
                            )}
                          </div>

                          {/* Stats */}
                          <div className="flex items-center gap-3 text-[11px]">
                            <span title="Confidence score">
                              Conf: <strong>{(mem.confidence * 100).toFixed(0)}%</strong>
                            </span>
                            <span>•</span>
                            <span title="Access count">
                              Recalled: <strong>{mem.accessCount || 0}x</strong>
                            </span>
                            <span>•</span>
                            <span className="flex items-center gap-1" title="Last accessed time">
                              <Clock className="w-3 h-3" />
                              {new Date(mem.lastAccessedAt || mem.createdAt).toLocaleDateString()}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

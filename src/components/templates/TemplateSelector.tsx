"use client";
import React, { useState, useEffect } from "react";
import { Search, Clock, ArrowRight } from "lucide-react";

export default function TemplateSelector({ onSelect }) {
  const [templates, setTemplates] = useState<Array<{id: string; name: string; description?: string; category?: string; icon?: string; estimatedSetupMinutes?: number; defaultTools?: string[]}>>([]);
  const [categories, setCategories] = useState<Array<{id: string; name: string; count: number; icon?: string; description?: string; estimatedSetupMinutes?: number; defaultTools?: string[]}>>([]);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/templates").then(r => r.json()).then(d => { setTemplates(d.templates || []); setCategories(d.categories || []); }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const filtered = templates.filter(t => {
    if (selectedCategory && t.category !== selectedCategory) return false;
// @ts-ignore — type narrowing pending, see refactor ticket
    if (search && !t.name.toLowerCase().includes(search.toLowerCase()) && !t.description.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
        <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher un template..."
          className="w-full pl-10 pr-4 py-2.5 bg-gray-800 border border-gray-700 rounded-xl text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
      </div>
      <div className="flex gap-2 overflow-x-auto pb-2">
        <button onClick={() => setSelectedCategory(null)}
          className={"px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition " + (!selectedCategory ? "bg-indigo-600 text-white" : "bg-gray-800 text-gray-400 hover:text-white")}>
          Tous ({templates.length})</button>
        {categories.map(cat => (
          <button key={cat.id} onClick={() => setSelectedCategory(cat.id)}
            className={"px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition " + (selectedCategory === cat.id ? "bg-indigo-600 text-white" : "bg-gray-800 text-gray-400 hover:text-white")}>
            {cat.name} ({cat.count})</button>
        ))}
      </div>
      {loading ? <div className="text-center text-gray-500 py-8">Chargement...</div>
      : filtered.length === 0 ? <div className="text-center text-gray-500 py-8">Aucun template trouve</div>
      : <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {filtered.map(tpl => (
            <button key={tpl.id} onClick={() => onSelect && onSelect(tpl)}
              className="text-left p-4 bg-gray-800 border border-gray-700 rounded-xl hover:border-indigo-500 transition group">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{tpl.icon}</span>
                  <div>
                    <h3 className="text-sm font-semibold text-gray-200 group-hover:text-indigo-400 transition">{tpl.name}</h3>
                    <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{tpl.description}</p>
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-gray-600 group-hover:text-indigo-400 transition" />
              </div>
              <div className="flex items-center gap-3 mt-3 text-[10px] text-gray-500">
                <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{tpl.estimatedSetupMinutes} min</span>
                <span className="px-1.5 py-0.5 bg-gray-700 rounded">{(tpl.defaultTools ?? []).length} outils</span>
              </div>
            </button>
          ))}
        </div>
      }
    </div>
  );
}

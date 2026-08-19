// ============================================================
// QUICK NOTES — Notes rapides taggées avec recherche
// Capture → Tags → Recherche → Export
// ============================================================

export interface QuickNote {
  id: string;
  title: string;
  content: string;
  tags: string[];
  color: 'yellow' | 'blue' | 'green' | 'red' | 'purple' | 'gray';
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface NoteSearchResult {
  notes: QuickNote[];
  total: number;
  query: string;
  tags: string[];
}

export class QuickNotes {
  private notes: Map<string, QuickNote> = new Map();

  create(title: string, content: string, tags: string[] = [], color: QuickNote['color'] = 'yellow'): QuickNote {
    const now = new Date().toISOString();
    const id = `note_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const note: QuickNote = { id, title, content, tags, color, pinned: false, createdAt: now, updatedAt: now };
    this.notes.set(id, note);
    return note;
  }

  update(id: string, data: Partial<Pick<QuickNote, 'title' | 'content' | 'tags' | 'color' | 'pinned'>>): QuickNote | null {
    const existing = this.notes.get(id);
    if (!existing) return null;
    const updated = { ...existing, ...data, id, updatedAt: new Date().toISOString() };
    this.notes.set(id, updated);
    return updated;
  }

  delete(id: string): boolean {
    return this.notes.delete(id);
  }

  get(id: string): QuickNote | null {
    return this.notes.get(id) || null;
  }

  list(limit = 50): QuickNote[] {
    return Array.from(this.notes.values())
      .sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
        return b.updatedAt.localeCompare(a.updatedAt);
      })
      .slice(0, limit);
  }

  search(query: string, tags?: string[]): NoteSearchResult {
    const lower = query.toLowerCase();
    let results = Array.from(this.notes.values());

    if (tags && tags.length > 0) {
      results = results.filter(n => tags.some(t => n.tags.includes(t)));
    }

    if (query) {
      results = results.filter(n =>
        n.title.toLowerCase().includes(lower) ||
        n.content.toLowerCase().includes(lower) ||
        n.tags.some(t => t.toLowerCase().includes(lower))
      );
    }

    results.sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return b.updatedAt.localeCompare(a.updatedAt);
    });

    return { notes: results, total: results.length, query, tags: tags || [] };
  }

  getAllTags(): Array<{ tag: string; count: number }> {
    const tagMap: Record<string, number> = {};
    for (const note of this.notes.values()) {
      for (const tag of note.tags) {
        tagMap[tag] = (tagMap[tag] || 0) + 1;
      }
    }
    return Object.entries(tagMap).map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count);
  }

  pin(id: string, pinned = true): QuickNote | null {
    return this.update(id, { pinned });
  }

  exportAll(): string {
    return JSON.stringify(Array.from(this.notes.values()), null, 2);
  }

  import(json: string): number {
    try {
      const notes: QuickNote[] = JSON.parse(json);
      let count = 0;
      for (const note of notes) {
        this.notes.set(note.id, note);
        count++;
      }
      return count;
    } catch {
      return 0;
    }
  }
}

export const quickNotes = new QuickNotes();

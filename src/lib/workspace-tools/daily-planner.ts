// ============================================================
// DAILY PLANNER — Planificateur de tâches avec matrice Eisenhower
// Prioritisation: Urgent+Important → Important → Urgent → Déléguer
// ============================================================

export interface PlannerTask {
  id: string;
  title: string;
  description?: string;
  priority: 'urgent-important' | 'important' | 'urgent' | 'delegate' | 'delete';
  estimatedMinutes: number;
  scheduledFor?: string; // ISO time block: "09:00-10:30"
  completed: boolean;
  createdAt: string;
  completedAt?: string;
  tags: string[];
}

export interface DailyPlan {
  date: string;
  tasks: PlannerTask[];
  totalTasks: number;
  completedTasks: number;
  totalEstimatedMinutes: number;
  byPriority: Record<string, { count: number; minutes: number }>;
  schedule: Array<{ timeBlock: string; task: PlannerTask }>;
  suggestions: string[];
}

export class DailyPlanner {
  private tasks: Map<string, PlannerTask> = new Map();

  add(task: Omit<PlannerTask, 'id' | 'completed' | 'createdAt'>): PlannerTask {
    const id = `task_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const full: PlannerTask = {
      ...task,
      id,
      completed: false,
      createdAt: new Date().toISOString(),
    };
    this.tasks.set(id, full);
    return full;
  }

  update(id: string, data: Partial<PlannerTask>): PlannerTask | null {
    const existing = this.tasks.get(id);
    if (!existing) return null;
    const updated = { ...existing, ...data, id };
    this.tasks.set(id, updated);
    return updated;
  }

  complete(id: string): PlannerTask | null {
    const task = this.tasks.get(id);
    if (!task) return null;
    task.completed = true;
    task.completedAt = new Date().toISOString();
    this.tasks.set(id, task);
    return task;
  }

  delete(id: string): boolean {
    return this.tasks.delete(id);
  }

  getDailyPlan(date?: string): DailyPlan {
    const targetDate = date || new Date().toISOString().split('T')[0];
    const dayTasks = Array.from(this.tasks.values())
      .filter(t => t.createdAt.startsWith(targetDate) || t.scheduledFor)
      .sort((a, b) => {
        const priorityOrder: Record<string, number> = {
          'urgent-important': 0, 'important': 1, 'urgent': 2, 'delegate': 3, 'delete': 4,
        };
        return (priorityOrder[a.priority] || 5) - (priorityOrder[b.priority] || 5);
      });

    const completed = dayTasks.filter(t => t.completed);
    const byPriority: Record<string, { count: number; minutes: number }> = {};
    for (const t of dayTasks) {
      if (!byPriority[t.priority]) byPriority[t.priority] = { count: 0, minutes: 0 };
      byPriority[t.priority].count++;
      byPriority[t.priority].minutes += t.estimatedMinutes;
    }

    const schedule = dayTasks
      .filter(t => t.scheduledFor && !t.completed)
      .map(t => ({ timeBlock: t.scheduledFor!, task: t }));

    return {
      date: targetDate,
      tasks: dayTasks,
      totalTasks: dayTasks.length,
      completedTasks: completed.length,
      totalEstimatedMinutes: dayTasks.reduce((sum, t) => sum + t.estimatedMinutes, 0),
      byPriority,
      schedule,
      suggestions: this.generateSuggestions(dayTasks),
    };
  }

  private generateSuggestions(tasks: PlannerTask[]): string[] {
    const suggestions: string[] = [];
    const totalMinutes = tasks.filter(t => !t.completed).reduce((sum, t) => sum + t.estimatedMinutes, 0);
    const urgentImportant = tasks.filter(t => t.priority === 'urgent-important' && !t.completed);

    if (urgentImportant.length > 3) {
      suggestions.push(`⚠️ ${urgentImportant.length} tâches urgentes+importantes — envisagez de déléguer certaines`);
    }

    if (totalMinutes > 480) {
      suggestions.push(`⏰ ${Math.round(totalMinutes / 60)}h de travail planifié — plus de 8h, reconsidérez les priorités`);
    }

    const unscheduled = tasks.filter(t => !t.completed && !t.scheduledFor);
    if (unscheduled.length > 0) {
      suggestions.push(`📋 ${unscheduled.length} tâches non programmées — ajoutez des créneaux horaires`);
    }

    const delegate = tasks.filter(t => t.priority === 'delegate' && !t.completed);
    if (delegate.length > 0) {
      suggestions.push(`🔄 ${delegate.length} tâches à déléguer — identifiez les bonnes personnes`);
    }

    if (suggestions.length === 0) {
      suggestions.push('✅ Votre journée est bien organisée !');
    }

    return suggestions;
  }

  getProductivityScore(): { score: number; total: number; completed: number; rate: number } {
    const all = Array.from(this.tasks.values());
    const completed = all.filter(t => t.completed);
    const rate = all.length > 0 ? (completed.length / all.length) * 100 : 0;
    return {
      score: Math.round(rate),
      total: all.length,
      completed: completed.length,
      rate: Math.round(rate * 100) / 100,
    };
  }

  list(priority?: string): PlannerTask[] {
    let items = Array.from(this.tasks.values());
    if (priority) items = items.filter(t => t.priority === priority);
    return items.sort((a, b) => {
      if (a.completed !== b.completed) return a.completed ? 1 : -1;
      return b.createdAt.localeCompare(a.createdAt);
    });
  }
}

export const dailyPlanner = new DailyPlanner();

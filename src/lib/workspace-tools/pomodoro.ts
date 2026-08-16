// ============================================================
// POMODORO TIMER — Gestion du temps et focus
// Cycle: 25min travail → 5min pause → 4 cycles → 15min pause longue
// ============================================================

export interface FocusSession {
  id: string;
  taskLabel: string;
  durationMin: number;
  startedAt: string;
  endedAt?: string;
  completed: boolean;
  interrupted: boolean;
  cycle: number; // 1-4
}

export interface PomodoroStats {
  totalSessions: number;
  completedSessions: number;
  interruptedSessions: number;
  totalFocusMinutes: number;
  averageSessionLength: number;
  longestStreak: number;
  currentStreak: number;
  todaySessions: number;
  todayFocusMinutes: number;
  byDay: Array<{ date: string; sessions: number; minutes: number }>;
}

export const POMODORO_CONFIG = {
  workMinutes: 25,
  shortBreakMinutes: 5,
  longBreakMinutes: 15,
  cyclesBeforeLongBreak: 4,
};

export class PomodoroTimer {
  private sessions: FocusSession[] = [];
  private current: FocusSession | null = null;
  private cycleCount = 0;

  start(taskLabel: string, durationMin = POMODORO_CONFIG.workMinutes): FocusSession {
    this.cycleCount = (this.cycleCount % POMODORO_CONFIG.cyclesBeforeLongBreak) + 1;
    this.current = {
      id: `pomo_${Date.now()}`,
      taskLabel,
      durationMin,
      startedAt: new Date().toISOString(),
      completed: false,
      interrupted: false,
      cycle: this.cycleCount,
    };
    return this.current;
  }

  complete(): FocusSession | null {
    if (!this.current) return null;
    this.current.completed = true;
    this.current.endedAt = new Date().toISOString();
    this.sessions.push(this.current);
    const done = this.current;
    this.current = null;
    return done;
  }

  interrupt(_reason?: string): FocusSession | null {
    if (!this.current) return null;
    this.current.interrupted = true;
    this.current.endedAt = new Date().toISOString();
    this.sessions.push(this.current);
    const done = this.current;
    this.current = null;
    return done;
  }

  getCurrent(): FocusSession | null {
    return this.current;
  }

  getNextBreak(): { type: 'short' | 'long'; minutes: number } {
    const isLongBreak = this.cycleCount >= POMODORO_CONFIG.cyclesBeforeLongBreak;
    return {
      type: isLongBreak ? 'long' : 'short',
      minutes: isLongBreak ? POMODORO_CONFIG.longBreakMinutes : POMODORO_CONFIG.shortBreakMinutes,
    };
  }

  getStats(): PomodoroStats {
    const completed = this.sessions.filter(s => s.completed);
    const interrupted = this.sessions.filter(s => s.interrupted);
    const totalFocusMinutes = completed.reduce((sum, s) => sum + s.durationMin, 0);

    const today = new Date().toISOString().split('T')[0];
    const todaySessions = this.sessions.filter(s => s.startedAt.startsWith(today));
    const todayFocusMinutes = todaySessions.filter(s => s.completed).reduce((sum, s) => sum + s.durationMin, 0);

    // Streak: consecutive completed sessions
    let currentStreak = 0;
    for (let i = this.sessions.length - 1; i >= 0; i--) {
      if (this.sessions[i].completed) currentStreak++;
      else break;
    }

    let longestStreak = 0;
    let temp = 0;
    for (const s of this.sessions) {
      if (s.completed) { temp++; longestStreak = Math.max(longestStreak, temp); }
      else temp = 0;
    }

    // By day (last 7 days)
    const byDay: Array<{ date: string; sessions: number; minutes: number }> = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      const daySessions = this.sessions.filter(s => s.startedAt.startsWith(dateStr));
      byDay.push({
        date: dateStr,
        sessions: daySessions.length,
        minutes: daySessions.filter(s => s.completed).reduce((sum, s) => sum + s.durationMin, 0),
      });
    }

    return {
      totalSessions: this.sessions.length,
      completedSessions: completed.length,
      interruptedSessions: interrupted.length,
      totalFocusMinutes,
      averageSessionLength: completed.length > 0 ? Math.round(totalFocusMinutes / completed.length) : 0,
      longestStreak,
      currentStreak,
      todaySessions: todaySessions.length,
      todayFocusMinutes,
      byDay,
    };
  }

  getSessions(limit = 20): FocusSession[] {
    return this.sessions.slice(-limit).reverse();
  }
}

export const pomodoroTimer = new PomodoroTimer();

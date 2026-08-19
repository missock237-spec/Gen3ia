// ============================================================
// WORKSPACE TOOLS — Outils productivité pour utilisateurs
// Export unifié de tous les outils workspace
// ============================================================

export { documentAnalyzer, DocumentAnalyzer, type DocumentAnalysis } from './document-analyzer';
export { businessCalculators, BusinessCalculators, type CurrencyRate } from './business-calculators';
export { meetingNotesProcessor, MeetingNotesProcessor, type MeetingResult } from './meeting-notes';

// Registry des outils workspace
export const WORKSPACE_TOOLS = [
  {
    name: 'document-analyzer',
    description: 'Analyse de documents: résumé, points clés, action items, entités, sentiment',
    endpoint: '/api/workspace/docs/analyze',
    method: 'POST',
  },
  {
    name: 'business-calculators',
    description: 'Suite de calculateurs: devises, marges, prêts, TVA, ROI, prix optimal',
    endpoint: '/api/workspace/calc',
    method: 'POST',
  },
  {
    name: 'meeting-notes',
    description: 'Processeur de notes de réunion: décisions, actions, participants, risques',
    endpoint: '/api/workspace/meeting-notes',
    method: 'POST',
  },
];

export { africanTranslator, AfricanTranslator, type SupportedLanguage } from './translator';

export { expenseTracker, ExpenseTracker, type Expense, type ExpenseSummary } from './expense-tracker';
export { pomodoroTimer, PomodoroTimer, type FocusSession, type PomodoroStats } from './pomodoro';
export { quickNotes, QuickNotes, type QuickNote } from './quick-notes';
export { emailTemplateEngine, EmailTemplateEngine, type EmailTemplate } from './email-templates';
export { dailyPlanner, DailyPlanner, type PlannerTask, type DailyPlan } from './daily-planner';

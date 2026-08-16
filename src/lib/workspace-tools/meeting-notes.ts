// ============================================================
// MEETING NOTES PROCESSOR — Extraction structurée de notes
// Input: transcription/notes brutes → Output: decisions, actions, 
//   résumé, participants, points de discussion
// ============================================================

export interface MeetingResult {
  title: string;
  date?: string;
  participants: string[];
  summary: string;
  decisions: Array<{ decision: string; context?: string }>;
  actionItems: Array<{ task: string; assignee?: string; dueDate?: string; priority: 'high' | 'medium' | 'low' }>;
  discussionPoints: string[];
  risks: string[];
  nextSteps: string[];
  duration?: string;
}

export class MeetingNotesProcessor {
  /**
   * Traite des notes de réunion brutes et extrait les informations structurées
   */
  async process(notes: string): Promise<MeetingResult> {
    return {
      title: this.extractTitle(notes),
      date: this.extractDate(notes),
      participants: this.extractParticipants(notes),
      summary: this.generateSummary(notes),
      decisions: this.extractDecisions(notes),
      actionItems: this.extractActionItems(notes),
      discussionPoints: this.extractDiscussionPoints(notes),
      risks: this.extractRisks(notes),
      nextSteps: this.extractNextSteps(notes),
      duration: this.extractDuration(notes),
    };
  }

  private extractTitle(notes: string): string {
    // Cherche un titre en première ligne ou après "Réunion", "Meeting"
    const firstLine = notes.split('\n')[0].trim();
    if (firstLine.length > 0 && firstLine.length < 150) {
      return firstLine.replace(/^#+\s*/, '').replace(/[*_]/g, '');
    }

    const titleMatch = notes.match(/(?:réunion|meeting|comité|séance|point)\s*(?:sur|de|du)?\s*(.{5,80})/i);
    return titleMatch ? `Réunion: ${titleMatch[1].trim()}` : 'Réunion sans titre';
  }

  private extractDate(notes: string): string | undefined {
    // Formats: 14/08/2026, 2026-08-14, 14 août 2026, August 14, 2026
    const patterns = [
      /\b(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})\b/,
      /\b(\d{4}-\d{2}-\d{2})\b/,
      /\b(\d{1,2}\s+(?:janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre|january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{4})\b/i,
    ];

    for (const pattern of patterns) {
      const match = notes.match(pattern);
      if (match) return match[1];
    }
    return undefined;
  }

  private extractDuration(notes: string): string | undefined {
    const patterns = [
      /(?:durée|duration|temps)\s*:\s*(\d+\s*(?:h|heure|hour|min|minute)\s*(?:\d+\s*(?:min|minute))?)\b/i,
      /\b(\d+h\d+)\b/,
      /\b(\d+\s*(?:heures|hours|heures?)\s*(?:\d+\s*(?:minutes?|min))?)\b/i,
    ];

    for (const pattern of patterns) {
      const match = notes.match(pattern);
      if (match) return match[1];
    }
    return undefined;
  }

  private extractParticipants(notes: string): string[] {
    // Pattern: "Participants: X, Y, Z" ou "Présents: X, Y, Z"
    const presentMatch = notes.match(/(?:participants?|présents?|attendees?|present)\s*:\s*(.+?)(?:\n|$)/i);
    if (presentMatch) {
      const names = presentMatch[1].split(/[,;]| et /).map(n => n.trim()).filter(n => n.length > 2);
      if (names.length > 0) return names.slice(0, 30);
    }

    // Détection: "M. X", "Mme Y", "Dr. Z", noms Capitalisés répétés
    const namePattern = /\b(?:M\.|Mme|Dr\.|Mr\.|Mrs\.|Ms\.)\s+([A-Z][a-zà-ÿ]+(?:\s+[A-Z][a-zà-ÿ]+)?)\b/g;
    const names: string[] = [];
    let match;
    while ((match = namePattern.exec(notes)) !== null) {
      names.push(match[1]);
    }

    // Pattern "X:" au début de ligne (prise de parole)
    const speakerPattern = /\n([A-Z][a-zà-ÿ]+(?:\s+[A-Z][a-zà-ÿ]+)?)\s*:/g;
    while ((match = speakerPattern.exec(notes)) !== null) {
      const name = match[1].trim();
      if (!names.includes(name) && name.length > 3) {
        names.push(name);
      }
    }

    return [...new Set(names)].slice(0, 30);
  }

  private generateSummary(notes: string): string {
    const sentences = notes.split(/[.!?]+/).map(s => s.trim()).filter(s => s.length > 20);
    if (sentences.length === 0) return 'Notes insuffisantes pour un résumé';

    // Prendre les 2-3 phrases les plus significatives
    const wordFreq: Record<string, number> = {};
    notes.toLowerCase().split(/\s+/).forEach(w => {
      const clean = w.replace(/[^a-zàâçéèêëîïôûùüÿñ-]/g, '');
      if (clean.length > 4) wordFreq[clean] = (wordFreq[clean] || 0) + 1;
    });

    const scored = sentences.slice(0, 20).map((s, i) => {
      const words = s.toLowerCase().split(/\s+/);
      let score = words.reduce((sum, w) => sum + (wordFreq[w.replace(/[^a-zàâçéèêëîïôûùüÿñ-]/g, '')] || 0), 0);
      score /= Math.max(words.length, 1);
      if (i < 3) score *= 1.5;
      return { sentence: s, score };
    });

    return scored.sort((a, b) => b.score - a.score).slice(0, 3).sort((_a, _b) => 0).map(s => s.sentence).join('. ') + '.';
  }

  private extractDecisions(notes: string): Array<{ decision: string; context?: string }> {
    const decisions: Array<{ decision: string; context?: string }> = [];

    // Pattern: "Décision:", "Il a été décidé que", "We decided", "Convenu"
    const patterns = [
      /(?:décision|decision|décidé|convenu|agreed|resolved|adopté)\s*:\s*(.+?)(?:\n|$)/gi,
      /(?:il a été décidé|nous avons décidé|we decided|it was decided)\s+(?:que\s+)?(.{10,200})/gi,
    ];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(notes)) !== null) {
        decisions.push({ decision: match[1].trim().slice(0, 300), context: undefined });
      }
    }

    return decisions.slice(0, 20);
  }

  private extractActionItems(notes: string): Array<{ task: string; assignee?: string; dueDate?: string; priority: 'high' | 'medium' | 'low' }> {
    const items: Array<{ task: string; assignee?: string; dueDate?: string; priority: 'high' | 'medium' | 'low' }> = [];

    // Pattern: "Action:", "À faire", "TODO", "Tâche", "Task"
    const actionPatterns = [
      /(?:action|à faire|todo|tâche|task)\s*:\s*(.+?)(?:\n|$)/gi,
      /(?:il faut|nous devons|vous devez|on doit|doit être|must|need to|should)\s+(.{10,200})/gi,
    ];

    const highPriority = /urgent|asap|immédiat|critique|prioritaire|avant|before|deadline|today|aujourd/i;
    const lowPriority = /eventually|plus tard|later|optional|optionnel|quand possible/i;

    for (const pattern of actionPatterns) {
      let match;
      while ((match = pattern.exec(notes)) !== null) {
        const task = match[1].trim().slice(0, 300);

        // Extract assignee: "par X", "assigné à X", "by X"
        const assigneeMatch = task.match(/(?:par|assigné à|by|owner:)\s+([A-Z][a-zà-ÿ]+(?:\s+[A-Z][a-zà-ÿ]+)?)/);
        const assignee = assigneeMatch?.[1];

        // Extract due date
        const dueMatch = task.match(/(?:avant|by|before|d'ici|pour le|pour|d'ici le)\s+(\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?)/);

        items.push({
          task: task.replace(/(?:par|assigné à|by|owner:)\s+[A-Z][a-zà-ÿ]+(?:\s+[A-Z][a-zà-ÿ]+)?/, '').trim(),
          assignee,
          dueDate: dueMatch?.[1],
          priority: highPriority.test(task) ? 'high' : lowPriority.test(task) ? 'low' : 'medium',
        });
      }
    }

    return items.slice(0, 30);
  }

  private extractDiscussionPoints(notes: string): string[] {
    const points: string[] = [];

    // Points de discussion: "- Point 1", "Discussion:", "Sujet:"
    const patterns = [
      /(?:point|discussion|sujet|topic)\s*\d*\s*:\s*(.+?)(?:\n|$)/gi,
      /[-•*]\s+([A-Z][^.\n]{20,200})/g,
    ];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(notes)) !== null) {
        const point = match[1].trim();
        if (point.length > 15 && !points.includes(point)) {
          points.push(point.slice(0, 300));
        }
      }
    }

    return points.slice(0, 15);
  }

  private extractRisks(notes: string): string[] {
    const risks: string[] = [];

    const patterns = [
      /(?:risque|risk|danger|menace|threat|préoccupation|concern)\s*:\s*(.+?)(?:\n|$)/gi,
      /(?:risque de|risk of|danger de)\s+(.{10,200})/gi,
    ];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(notes)) !== null) {
        risks.push(match[1].trim().slice(0, 300));
      }
    }

    return risks.slice(0, 10);
  }

  private extractNextSteps(notes: string): string[] {
    const steps: string[] = [];

    const patterns = [
      /(?:prochaine étape|next step|prochaine réunion|next meeting|à suivre|follow-?up)\s*:\s*(.+?)(?:\n|$)/gi,
      /(?:prochaine étape|next)\s+(?:est\s+|is\s+)?(.{10,200})/gi,
    ];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(notes)) !== null) {
        steps.push(match[1].trim().slice(0, 300));
      }
    }

    // Si pas de prochaines étapes explicites, suggérer basé sur les action items
    if (steps.length === 0) {
      steps.push('Suivre les action items ci-dessus');
    }

    return steps.slice(0, 10);
  }
}

export const meetingNotesProcessor = new MeetingNotesProcessor();

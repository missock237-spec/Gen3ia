// ============================================================
// DOCUMENT ANALYZER — Analyse intelligente de documents
// Extrait: résumé, points clés, action items, entités, sentiment
// Supporte: texte, markdown, JSON, extractions de PDF/DOCX (via texte)
// ============================================================

export interface DocumentAnalysis {
  summary: string;
  keyPoints: string[];
  actionItems: Array<{ task: string; priority: 'high' | 'medium' | 'low'; assignee?: string; dueDate?: string }>;
  entities: Array<{ name: string; type: 'person' | 'organization' | 'date' | 'amount' | 'location'; value: string }>;
  sentiment: 'positive' | 'neutral' | 'negative' | 'mixed';
  sentimentScore: number; // -1 to 1
  language: string;
  wordCount: number;
  readingTimeMin: number;
  topics: string[];
  warnings: string[];
}

export class DocumentAnalyzer {
  /**
   * Analyse un document texte et extrait les informations clés
   */
  async analyze(content: string, options?: { language?: string }): Promise<DocumentAnalysis> {
    const language = options?.language || this.detectLanguage(content);
    const wordCount = content.split(/\s+/).filter(Boolean).length;
    const readingTimeMin = Math.max(1, Math.ceil(wordCount / 200));

    return {
      summary: this.generateSummary(content),
      keyPoints: this.extractKeyPoints(content),
      actionItems: this.extractActionItems(content, language),
      entities: this.extractEntities(content),
      sentiment: this.analyzeSentiment(content),
      sentimentScore: this.calculateSentimentScore(content),
      language,
      wordCount,
      readingTimeMin,
      topics: this.extractTopics(content),
      warnings: this.detectWarnings(content),
    };
  }

  private generateSummary(content: string): string {
    // Algorithme d'extraction: premières phrases + phrases avec mots-clés
    const sentences = content.split(/[.!?]+/).map(s => s.trim()).filter(s => s.length > 10);
    if (sentences.length === 0) return content.slice(0, 200);

    // Score par fréquence de mots (TF simplifié)
    const wordFreq: Record<string, number> = {};
    const stopWords = new Set(['le', 'la', 'les', 'de', 'du', 'des', 'un', 'une', 'et', 'or', 'the', 'a', 'an', 'is', 'are', 'in', 'on', 'at', 'to', 'for', 'of', 'with']);
    
    content.toLowerCase().split(/\s+/).forEach(w => {
      const clean = w.replace(/[^a-zàâçéèêëîïôûùüÿñ-]/g, '');
      if (clean.length > 3 && !stopWords.has(clean)) {
        wordFreq[clean] = (wordFreq[clean] || 0) + 1;
      }
    });

    // Score chaque phrase
    const scored = sentences.map((s, i) => {
      const words = s.toLowerCase().split(/\s+/);
      let score = words.reduce((sum, w) => sum + (wordFreq[w.replace(/[^a-zàâçéèêëîïôûùüÿñ-]/g, '')] || 0), 0);
      score /= Math.max(words.length, 1);
      // Bonus pour les premières phrases
      if (i < 3) score *= 1.3;
      return { sentence: s, score, index: i };
    });

    // Prendre le top 3
    const top = scored.sort((a, b) => b.score - a.score).slice(0, 3).sort((a, b) => a.index - b.index);
    return top.map(s => s.sentence).join('. ') + '.';
  }

  private extractKeyPoints(content: string): string[] {
    const points: string[] = [];
    
    // Patterns de listes: -, *, •, 1., etc.
    const listPatterns = content.match(/(?:^|\n)\s*(?:[-*•]|\d+[.)])\s+(.+)/g);
    if (listPatterns) {
      points.push(...listPatterns.map(p => p.replace(/(?:^|\n)\s*(?:[-*•]|\d+[.)])\s+/, '').trim()).slice(0, 10));
    }

    // Phrases contenant des mots clés importants
    const keywords = /important|crucial|essenti|notez|remarqu|key|critical|must|doit|faut|obligat/i;
    const keySentences = content.split(/[.!?]+/).filter(s => keywords.test(s) && s.trim().length > 15);
    if (keySentences.length > 0 && points.length < 5) {
      points.push(...keySentences.slice(0, 5 - points.length).map(s => s.trim()));
    }

    // Si rien trouvé, prendre les phrases les plus longues
    if (points.length === 0) {
      const sentences = content.split(/[.!?]+/).map(s => s.trim()).filter(s => s.length > 30);
      points.push(...sentences.slice(0, 5));
    }

    return points.slice(0, 10);
  }

  private extractActionItems(content: string, language: string): Array<{ task: string; priority: 'high' | 'medium' | 'low'; assignee?: string; dueDate?: string }> {
    const items: Array<{ task: string; priority: 'high' | 'medium' | 'low'; assignee?: string; dueDate?: string }> = [];

    // Patterns d'action: "il faut", "à faire", "TODO", "must", "need to", "should"
    const actionPatterns = [
      /(?:il faut|à faire|todo|doit|faut|nous devons|vous devez|on doit)\s+(.{10,200})/gi,
      /(?:must|need to|should|have to|required to)\s+(.{10,200})/gi,
      /(?:assigné à|responsable|owner:|par)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s*:\s*(.{10,200})/gi,
    ];

    const highPriority = /urgent|asap|immédiat|critique|before|avant|deadline|today|aujourd/i;
    const lowPriority = /eventually|quand possible|plus tard|later|optional|optionnel/i;

    for (const pattern of actionPatterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const task = (match[2] || match[1]).trim().slice(0, 200);
        const assignee = match[2] ? match[1].trim() : undefined;
        
        // Extract due date
        const dateMatch = content.slice(Math.max(0, match.index - 100), match.index + match[0].length + 100)
          .match(/(?:avant|by|before|d'ici|pour le)\s+(\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?)/i);
        
        items.push({
          task,
          priority: highPriority.test(task) ? 'high' : lowPriority.test(task) ? 'low' : 'medium',
          assignee,
          dueDate: dateMatch?.[1],
        });
      }
    }

    return items.slice(0, 20);
  }

  private extractEntities(content: string): Array<{ name: string; type: 'person' | 'organization' | 'date' | 'amount' | 'location'; value: string }> {
    const entities: Array<{ name: string; type: 'person' | 'organization' | 'date' | 'amount' | 'location'; value: string }> = [];

    // Personnes: Prénom Nom
    const persons = content.match(/\b([A-Z][a-zà-ÿ]+(?:\s+[A-Z][a-zà-ÿ]+){1,2})\b/g);
    if (persons) {
      const unique = [...new Set(persons)].slice(0, 10);
      unique.forEach(p => entities.push({ name: p, type: 'person', value: p }));
    }

    // Organisations: mots en majuscules (acronymes) ou "Société X"
    const orgs = content.match(/\b(?:SARL|SAS|SA|SASU|GIE|EI)\s+([A-Z][A-Za-z\s]+)|\b([A-Z]{2,6})\b/g);
    if (orgs) {
      [...new Set(orgs)].slice(0, 5).forEach(o => entities.push({ name: o, type: 'organization', value: o }));
    }

    // Dates
    const dates = content.match(/\b\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?|\d{4}-\d{2}-\d{2}\b/g);
    if (dates) {
      [...new Set(dates)].slice(0, 5).forEach(d => entities.push({ name: d, type: 'date', value: d }));
    }

    // Montants (FCFA, EUR, USD, NGN, GHS)
    const amounts = content.match(/\b(?:FCFA|XOF|XAF|EUR|€|USD|\$|NGN|₦|GHS|GH₵)\s*[\d.,]+|[\d.,]+\s*(?:FCFA|XOF|XAF|EUR|€|USD|\$|NGN|₦|GHS|GH₵)\b/gi);
    if (amounts) {
      [...new Set(amounts)].slice(0, 10).forEach(a => entities.push({ name: a, type: 'amount', value: a }));
    }

    // Lieux (villes africaines communes)
    const cities = /\b(Douala|Yaoundé|Lagos|Abuja|Accra|Dakar|Abidjan|Bamako|Conakry|Niamey|Cotonou|Lomé|Ouagadougou|Bamako|Kigali|Nairobi|Kinshasa|Libreville|Malabo|Bissau|N'Djamena|Bangui|Brazzaville)\b/gi;
    const cityMatches = content.match(cities);
    if (cityMatches) {
      [...new Set(cityMatches.map(c => c))].slice(0, 5).forEach(l => entities.push({ name: l, type: 'location', value: l }));
    }

    return entities.slice(0, 30);
  }

  private analyzeSentiment(content: string): 'positive' | 'neutral' | 'negative' | 'mixed' {
    const score = this.calculateSentimentScore(content);
    if (score > 0.2) return 'positive';
    if (score < -0.2) return 'negative';
    if (Math.abs(score) < 0.05) return 'neutral';
    return 'mixed';
  }

  private calculateSentimentScore(content: string): number {
    const positive = /bon|excellent|réussi|positif|genial|parfait|opportunité|croissance|bénéfice|profit|succès|happy|good|great|excellent|success|growth|benefit/gi;
    const negative = /mauvais|échec|négatif|problème|difficulté|perte|risque|échec|échouer|crise|bad|fail|problem|issue|risk|loss|crisis/gi;

    const posMatches = (content.match(positive) || []).length;
    const negMatches = (content.match(negative) || []).length;
    const total = posMatches + negMatches;

    if (total === 0) return 0;
    return (posMatches - negMatches) / total;
  }

  private detectLanguage(content: string): string {
    const french = /\b(le|la|les|de|du|des|une|un|et|est|sont|dans|pour|avec|sur|par|ce|cette|nous|vous|ils|elles)\b/gi;
    const english = /\b(the|is|are|was|were|in|on|at|to|for|with|by|this|that|we|you|they|have|has|will|would)\b/gi;
    const frenchCount = (content.match(french) || []).length;
    const englishCount = (content.match(english) || []).length;

    if (frenchCount > englishCount) return 'fr';
    if (englishCount > 0) return 'en';
    return 'unknown';
  }

  private extractTopics(content: string): string[] {
    // Extraction de topics par fréquence de mots
    const stopWords = new Set([
      'le', 'la', 'les', 'de', 'du', 'des', 'un', 'une', 'et', 'ou', 'mais', 'donc',
      'the', 'a', 'an', 'is', 'are', 'in', 'on', 'at', 'to', 'for', 'of', 'with',
      'this', 'that', 'it', 'from', 'by', 'as', 'be', 'was', 'were', 'will', 'would',
    ]);

    const wordFreq: Record<string, number> = {};
    content.toLowerCase().split(/\s+/).forEach(w => {
      const clean = w.replace(/[^a-zàâçéèêëîïôûùüÿñ-]/g, '');
      if (clean.length > 4 && !stopWords.has(clean)) {
        wordFreq[clean] = (wordFreq[clean] || 0) + 1;
      }
    });

    return Object.entries(wordFreq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([word]) => word);
  }

  private detectWarnings(content: string): string[] {
    const warnings: string[] = [];

    // Contient des informations sensibles?
    if (/\b(?:mot de passe|password|secret|clé privée|private key|token)\b/i.test(content)) {
      warnings.push('Document contenant potentiellement des informations sensibles');
    }

    // Très long?
    if (content.length > 50000) {
      warnings.push('Document très long — l\'analyse peut être incomplète');
    }

    // Contient des montants financiers?
    const amounts = content.match(/[\d.,]+\s*(?:FCFA|XOF|EUR|USD|NGN)/gi);
    if (amounts && amounts.length > 5) {
      warnings.push(`Document contient ${amounts.length} références financières — vérifier l'exactitude`);
    }

    return warnings;
  }
}

export const documentAnalyzer = new DocumentAnalyzer();

// ============================================================
// EMAIL TEMPLATES — Modèles d'emails business pré-construits
// Français + Anglais, contextes business africains
// ============================================================

export interface EmailTemplate {
  id: string;
  name: string;
  category: 'business' | 'sales' | 'follow-up' | 'invoice' | 'apology' | 'proposal' | 'hr' | 'networking';
  language: 'fr' | 'en';
  subject: string;
  body: string;
  variables: string[];
}

export const EMAIL_TEMPLATES: EmailTemplate[] = [
  {
    id: 'tpl_quote_fr',
    name: 'Demande de devis',
    category: 'business',
    language: 'fr',
    subject: 'Demande de devis — {{objet}}',
    body: `Bonjour {{nom}},

J'espère que vous allez bien.

Suite à notre échange, je vous contacte pour solliciter un devis concernant {{objet}}.

Pourriez-vous me communiquer:
- Le coût estimatif
- Les délais de réalisation
- Les conditions de paiement

Je reste à votre disposition pour tout complément d'information.

Cordialement,
{{expediteur}}
{{entreprise}}
{{telephone}}`,
    variables: ['nom', 'objet', 'expediteur', 'entreprise', 'telephone'],
  },
  {
    id: 'tpl_invoice_fr',
    name: 'Relance facture impayée',
    category: 'invoice',
    language: 'fr',
    subject: 'Relance — Facture n° {{numero}} en attente de paiement',
    body: `Bonjour {{nom}},

Je me permets de vous relancer concernant la facture n° {{numero}} d'un montant de {{montant}} FCFA, émise le {{date_emission}} et arrivant à échéance le {{date_echeance}}.

À ce jour, le paiement ne nous est pas encore parvenu.

Je vous remercie de bien vouloir régulariser cette situation dans les meilleurs délais. Vous trouverez la facture en pièce jointe.

En cas de règlement déjà effectué, merci de ne pas tenir compte de ce message.

Cordialement,
{{expediteur}}
{{entreprise}}`,
    variables: ['nom', 'numero', 'montant', 'date_emission', 'date_echeance', 'expediteur', 'entreprise'],
  },
  {
    id: 'tpl_meeting_fr',
    name: 'Demande de réunion',
    category: 'business',
    language: 'fr',
    subject: 'Demande de réunion — {{sujet}}',
    body: `Bonjour {{nom}},

Je souhaiterais organiser une réunion pour discuter de {{sujet}}.

Voici mes disponibilités:
- {{date1}} à {{heure1}}
- {{date2}} à {{heure2}}

La réunion pourrait se tenir {{lieu}} (en présentiel ou en visioconférence).

Merci de me confirmer votre disponibilité.

Bien à vous,
{{expediteur}}`,
    variables: ['nom', 'sujet', 'date1', 'heure1', 'date2', 'heure2', 'lieu', 'expediteur'],
  },
  {
    id: 'tpl_proposal_fr',
    name: 'Proposition commerciale',
    category: 'proposal',
    language: 'fr',
    subject: 'Proposition commerciale — {{projet}}',
    body: `Bonjour {{nom}},

Suite à notre rencontre, veuillez trouver ci-dessous notre proposition pour {{projet}}.

1. Objectifs:
{{objectifs}}

2. Méthodologie:
{{methodologie}}

3. Délais:
{{delais}}

4. Budget:
{{budget}} FCFA

5. Conditions de paiement:
- 50% à la commande
- 50% à la livraison

Nous restons à votre entière disposition pour toute question.

Cordialement,
{{expediteur}}
{{entreprise}}`,
    variables: ['nom', 'projet', 'objectifs', 'methodologie', 'delais', 'budget', 'expediteur', 'entreprise'],
  },
  {
    id: 'tpl_followup_fr',
    name: 'Suivi après rendez-vous',
    category: 'follow-up',
    language: 'fr',
    subject: 'Suite à notre rencontre du {{date}}',
    body: `Bonjour {{nom}},

Je vous remercie pour le temps accordé lors de notre rendez-vous du {{date}}.

Comme convenu, voici les points clés:
{{points}}

Les prochaines étapes:
1. {{etape1}}
2. {{etape2}}

Je vous recontacterai prochainement pour faire le point.

Bien cordialement,
{{expediteur}}`,
    variables: ['nom', 'date', 'points', 'etape1', 'etape2', 'expediteur'],
  },
  {
    id: 'tpl_apology_fr',
    name: 'Excuse pour retard',
    category: 'apology',
    language: 'fr',
    subject: 'Nos excuses — {{situation}}',
    body: `Bonjour {{nom}},

Je tiens à vous présenter mes sincères excuses concernant {{situation}}.

{{raison}}

Nous mettons tout en œuvre pour éviter que cela se reproduise. En guise de dédommagement, {{compensation}}.

Je vous remercie de votre compréhension.

Cordialement,
{{expediteur}}
{{entreprise}}`,
    variables: ['nom', 'situation', 'raison', 'compensation', 'expediteur', 'entreprise'],
  },
  {
    id: 'tpl_quote_en',
    name: 'Quote Request',
    category: 'business',
    language: 'en',
    subject: 'Quote Request — {{subject}}',
    body: `Dear {{name}},

I hope this message finds you well.

Following our discussion, I would like to request a quote for {{subject}}.

Could you please provide:
- Estimated cost
- Timeline
- Payment terms

I remain available for any additional information.

Best regards,
{{sender}}
{{company}}
{{phone}}`,
    variables: ['name', 'subject', 'sender', 'company', 'phone'],
  },
  {
    id: 'tpl_meeting_en',
    name: 'Meeting Request',
    category: 'business',
    language: 'en',
    subject: 'Meeting Request — {{topic}}',
    body: `Dear {{name}},

I would like to schedule a meeting to discuss {{topic}}.

Here are my availabilities:
- {{date1}} at {{time1}}
- {{date2}} at {{time2}}

The meeting could take place {{location}} (in person or via video call).

Please confirm your availability.

Best regards,
{{sender}}`,
    variables: ['name', 'topic', 'date1', 'time1', 'date2', 'time2', 'location', 'sender'],
  },
  {
    id: 'tpl_invoice_en',
    name: 'Invoice Reminder',
    category: 'invoice',
    language: 'en',
    subject: 'Reminder — Invoice #{{number}} pending',
    body: `Dear {{name}},

I would like to remind you that invoice #{{number}} for the amount of {{amount}} is now overdue (issued on {{issue_date}}, due on {{due_date}}).

As of today, we have not yet received payment.

Kindly regularize this situation at your earliest convenience. The invoice is attached.

If payment has already been made, please disregard this message.

Best regards,
{{sender}}
{{company}}`,
    variables: ['name', 'number', 'amount', 'issue_date', 'due_date', 'sender', 'company'],
  },
  {
    id: 'tpl_proposal_en',
    name: 'Business Proposal',
    category: 'proposal',
    language: 'en',
    subject: 'Business Proposal — {{project}}',
    body: `Dear {{name}},

Following our meeting, please find below our proposal for {{project}}.

1. Objectives:
{{objectives}}

2. Methodology:
{{methodology}}

3. Timeline:
{{timeline}}

4. Budget:
{{budget}}

5. Payment terms:
- 50% upon order
- 50% upon delivery

We remain at your disposal for any questions.

Best regards,
{{sender}}
{{company}}`,
    variables: ['name', 'project', 'objectives', 'methodology', 'timeline', 'budget', 'sender', 'company'],
  },
];

export class EmailTemplateEngine {
  list(category?: string, language?: string): EmailTemplate[] {
    return EMAIL_TEMPLATES.filter(t =>
      (!category || t.category === category) &&
      (!language || t.language === language)
    );
  }

  get(id: string): EmailTemplate | null {
    return EMAIL_TEMPLATES.find(t => t.id === id) || null;
  }

  render(id: string, variables: Record<string, string>): { subject: string; body: string } | null {
    const tpl = this.get(id);
    if (!tpl) return null;

    let subject = tpl.subject;
    let body = tpl.body;

    for (const [key, value] of Object.entries(variables)) {
      const regex = new RegExp(`{{${key}}}`, 'g');
      subject = subject.replace(regex, value);
      body = body.replace(regex, value);
    }

    return { subject, body };
  }

  getCategories(): string[] {
    return [...new Set(EMAIL_TEMPLATES.map(t => t.category))];
  }
}

export const emailTemplateEngine = new EmailTemplateEngine();

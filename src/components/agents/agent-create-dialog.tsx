'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Slider } from '@/components/ui/slider';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Bot,
  Loader2,
  Cpu,
  Search,
  Code,
  BarChart3,
  PenTool,
  Languages,
  ImageIcon,
  Mail,
  FileText,
  Sparkles,
  Check,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { apiFetch } from '@/lib/api';
import { AVAILABLE_SKILLS, type SkillDef, type Agent } from './agents-view';

// ============================================================
// Types
// ============================================================

interface AgentCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  editAgent?: Agent | null;
}

// ============================================================
// Constants
// ============================================================

const PURPOSE_OPTIONS = [
  { value: 'assistant_general', label: 'Assistant général' },
  { value: 'analyste_donnees', label: 'Analyste de données' },
  { value: 'developpeur', label: 'Développeur' },
  { value: 'redacteur', label: 'Rédacteur' },
  { value: 'traducteur', label: 'Traducteur' },
  { value: 'rechercheur', label: 'Rechercheur' },
];

const PURPOSE_SYSTEM_PROMPTS: Record<string, string> = {
  assistant_general:
    'Tu es un assistant IA généraliste. Tu es professionnel, serviable et précis. Tu réponds aux questions de l\'utilisateur avec clarté et exactitude. Tu peux aider sur tout type de sujet et tu adaptes ton style selon les besoins.',
  analyste_donnees:
    'Tu es un analyste de données expert. Tu analyses les ensembles de données, identifies les tendances et les anomalies, et présentes tes conclusions sous forme de rapports structurés. Tu maîtrises les statistiques descriptives et inférentielles. Tu utilises des tableaux et des listes pour organiser tes analyses.',
  developpeur:
    'Tu es un développeur logiciel expérimenté. Tu écris du code propre, bien documenté et optimisé dans différents langages (JavaScript/TypeScript, Python, etc.). Tu expliques tes choix techniques et proposes des solutions adaptées. Tu débogues efficacement et suis les bonnes pratiques de développement.',
  redacteur:
    'Tu es un rédacteur professionnel. Tu crées du contenu engageant, bien structuré et adapté au public cible. Tu maîtrises l\'art du copywriting, la rédaction d\'articles, d\'emails et de documents commerciaux. Tu portes une attention particulière au style, à la grammaire et à l\'orthographe.',
  traducteur:
    'Tu es un traducteur professionnel multilingue. Tu traduis avec précision tout en respectant le ton, le style et les nuances culturelles du texte source. Tu peux traduire vers et depuis le français, l\'anglais, l\'espagnol, l\'allemand et d\'autres langues. Tu indiques toujours les langues source et cible.',
  rechercheur:
    'Tu es un assistant de recherche approfondie. Tu effectues des recherches rigoureuses, synthétises des informations complexes et présentes des résultats structurés. Tu es méticuleux et cites tes sources. Tu explores les sujets en profondeur et proposes des analyses nuancées.',
};

const MODEL_OPTIONS = [
  { value: 'default', label: 'Automatique (recommandé)' },
  { value: 'groq/llama-3.3-70b-versatile', label: 'Llama 3.3 70B' },
  { value: 'groq/llama-3.1-8b-instant', label: 'Llama 3.1 8B (rapide)' },
  { value: 'openai/gpt-4o', label: 'GPT-4o' },
  { value: 'openai/gpt-4o-mini', label: 'GPT-4o Mini' },
  { value: 'openai/o3-mini', label: 'o3-mini' },
  { value: 'anthropic/claude-3.5-sonnet', label: 'Claude 3.5 Sonnet' },
  { value: 'anthropic/claude-3-haiku', label: 'Claude 3 Haiku (rapide)' },
  { value: 'anthropic/claude-4-sonnet', label: 'Claude 4 Sonnet' },
  { value: 'openrouter/llama-3.1-8b', label: 'Llama 3.1 8B (gratuit)' },
];

const SKILL_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  web_search: Search,
  code_generation: Code,
  data_analysis: BarChart3,
  writing: PenTool,
  translation: Languages,
  image_generation: ImageIcon,
  email: Mail,
  document_analysis: FileText,
};

// ============================================================
// Component
// ============================================================

export function AgentCreateDialog({ open, onOpenChange, onSuccess, editAgent }: AgentCreateDialogProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const parseConfig = (configStr: string): Record<string, unknown> => {
    try {
      return JSON.parse(configStr || '{}');
    } catch {
      return {};
    }
  };

  const existingConfig = editAgent ? parseConfig(editAgent.config) : {};
  const existingSkills: string[] = Array.isArray(existingConfig.skills)
    ? (existingConfig.skills as string[])
    : [];
  const existingKnowledge = (existingConfig.knowledge as string) || '';

  const [name, setName] = useState(editAgent?.name || '');
  const [description, setDescription] = useState(editAgent?.description || '');
  const [purpose, setPurpose] = useState('');
  const [systemPrompt, setSystemPrompt] = useState(
    (existingConfig.systemPrompt as string) || ''
  );
  const [selectedSkills, setSelectedSkills] = useState<string[]>(existingSkills);
  const [knowledge, setKnowledge] = useState(existingKnowledge);
  const [model, setModel] = useState((existingConfig.model as string) || 'default');
  const [temperature, setTemperature] = useState(
    typeof existingConfig.temperature === 'number' ? (existingConfig.temperature as number) : 0.7
  );

  // Determine initial purpose from edit agent's type
  useEffect(() => {
    if (editAgent && !purpose) {
      const typeMap: Record<string, string> = {
        support: 'assistant_general',
        sales: 'assistant_general',
        research: 'rechercheur',
        marketing: 'redacteur',
        rh: 'assistant_general',
        accounting: 'analyste_donnees',
        social_media: 'redacteur',
        browser: 'rechercheur',
        custom: 'assistant_general',
      };
      setPurpose(typeMap[editAgent.type] || 'assistant_general');
    }
  }, [editAgent, purpose]);

  // Auto-fill system prompt when purpose changes
  useEffect(() => {
    if (purpose && !editAgent) {
      setSystemPrompt(PURPOSE_SYSTEM_PROMPTS[purpose] || '');
    }
  }, [purpose, editAgent]);

  // Reset form when dialog opens/closes
  useEffect(() => {
    if (open) {
      setName(editAgent?.name || '');
      setDescription(editAgent?.description || '');
      setPurpose('');
      setSystemPrompt(editAgent ? ((existingConfig.systemPrompt as string) || '') : '');
      setSelectedSkills(
        editAgent
          ? (Array.isArray(existingConfig.skills) ? (existingConfig.skills as string[]) : [])
          : []
      );
      setKnowledge(editAgent ? ((existingConfig.knowledge as string) || '') : '');
      setModel((existingConfig.model as string) || 'default');
      setTemperature(
        typeof existingConfig.temperature === 'number' ? (existingConfig.temperature as number) : 0.7
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleSkillToggle = (skillId: string) => {
    setSelectedSkills((prev) =>
      prev.includes(skillId) ? prev.filter((s) => s !== skillId) : [...prev, skillId]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast({ title: 'Erreur', description: 'Le nom est requis', variant: 'destructive' });
      return;
    }

    // Determine agent type from purpose
    const purposeToType: Record<string, string> = {
      assistant_general: 'custom',
      analyste_donnees: 'custom',
      developpeur: 'custom',
      redacteur: 'marketing',
      traducteur: 'custom',
      rechercheur: 'research',
    };

    const agentType = editAgent?.type || purposeToType[purpose] || 'custom';

    setLoading(true);
    try {
      const config = {
        systemPrompt: systemPrompt,
        skills: selectedSkills,
        knowledge: knowledge,
        model: model,
        temperature: temperature,
      };

      if (editAgent) {
        await apiFetch(`/api/agents/${editAgent.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            name: name.trim(),
            description: description.trim(),
            type: agentType,
            config,
          }),
        });
        toast({
          title: 'Agent modifié',
          description: `${name} a été mis à jour avec succès`,
        });
      } else {
        await apiFetch('/api/agents', {
          method: 'POST',
          body: JSON.stringify({
            name: name.trim(),
            type: agentType,
            description: description.trim(),
            config,
          }),
        });
        toast({
          title: 'Agent créé',
          description: `${name} a été créé avec succès`,
        });
      }

      onOpenChange(false);
      onSuccess();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erreur serveur';
      toast({ title: 'Erreur', description: message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-0">
          <DialogTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-[#06b6d4]" />
            {editAgent ? "Modifier l'agent" : 'Créer un agent IA'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <ScrollArea className="flex-1 px-6">
            <div className="pb-6 space-y-6 pt-4">
              {/* Nom */}
              <div className="space-y-2">
                <Label className="flex items-center gap-1.5">
                  Nom de l'agent <span className="text-destructive">*</span>
                </Label>
                <Input
                  placeholder="Ex : Assistant Marketing Pro"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={100}
                  className="rounded-xl"
                />
                <p className="text-[10px] text-muted-foreground text-right">
                  {name.length}/100
                </p>
              </div>

              {/* Description */}
              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea
                  placeholder="Décrivez le rôle et l'objectif de cet agent..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                  maxLength={1000}
                  className="rounded-xl resize-none"
                />
                <p className="text-[10px] text-muted-foreground text-right">
                  {description.length}/1000
                </p>
              </div>

              {/* Purpose dropdown */}
              <div className="space-y-2">
                <Label>Objectif</Label>
                <Select value={purpose} onValueChange={setPurpose}>
                  <SelectTrigger className="rounded-xl">
                    <SelectValue placeholder="Sélectionner un objectif..." />
                  </SelectTrigger>
                  <SelectContent>
                    {PURPOSE_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[10px] text-muted-foreground">
                  L'objectif pré-remplit le prompt système adapté.
                </p>
              </div>

              {/* System prompt */}
              <div className="space-y-2">
                <Label className="flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-[#06b6d4]" />
                  Prompt système
                </Label>
                <Textarea
                  placeholder="Instructions détaillées pour l'agent. Définissez son comportement, ses connaissances et ses limites..."
                  value={systemPrompt}
                  onChange={(e) => setSystemPrompt(e.target.value)}
                  rows={5}
                  className="rounded-xl resize-none"
                />
                <p className="text-[10px] text-muted-foreground">
                  Ce prompt définit le comportement de base de l'agent. Il est pré-rempli selon l'objectif choisi.
                </p>
              </div>

              <Separator />

              {/* Skills checkboxes */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-base">Compétences</Label>
                  <Badge variant="secondary" className="text-xs">
                    {selectedSkills.length} sélectionnée{selectedSkills.length !== 1 ? 's' : ''}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  Cochez les compétences que vous souhaitez attribuer à cet agent.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {AVAILABLE_SKILLS.map((skill: SkillDef) => {
                    const SkillIcon = SKILL_ICONS[skill.id] || Bot;
                    const isSelected = selectedSkills.includes(skill.id);
                    return (
                      <button
                        key={skill.id}
                        type="button"
                        onClick={() => handleSkillToggle(skill.id)}
                        className={`flex items-start gap-3 p-3 rounded-xl border text-left transition-all ${
                          isSelected
                            ? 'border-[#06b6d4]/30 bg-[#06b6d4]/5'
                            : 'border-border/50 bg-card hover:border-[#06b6d4]/20 hover:bg-accent/30'
                        }`}
                      >
                        <div
                          className={`mt-0.5 p-1.5 rounded-lg ${isSelected ? skill.bgColor : 'bg-muted'}`}
                        >
                          <SkillIcon
                            className={`h-4 w-4 ${isSelected ? skill.color : 'text-muted-foreground'}`}
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <span
                            className={`text-sm font-medium ${
                              isSelected ? 'text-foreground' : 'text-muted-foreground'
                            }`}
                          >
                            {skill.label}
                          </span>
                          <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-1">
                            {skill.description}
                          </p>
                        </div>
                        <div
                          className={`w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0 border transition-colors mt-0.5 ${
                            isSelected
                              ? 'bg-[#06b6d4] border-[#06b6d4] text-white'
                              : 'border-border'
                          }`}
                        >
                          {isSelected && <Check className="h-3 w-3" />}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <Separator />

              {/* Knowledge textarea */}
              <div className="space-y-2">
                <Label className="flex items-center gap-1.5">
                  <FileText className="h-3.5 w-3.5 text-[#06b6d4]" />
                  Connaissances personnalisées
                </Label>
                <Textarea
                  placeholder="Ajoutez des instructions, contextes ou informations spécifiques que l'agent pourra utiliser comme référence. Par exemple : la charte graphique de votre entreprise, des procédures internes, des informations produits..."
                  value={knowledge}
                  onChange={(e) => setKnowledge(e.target.value)}
                  rows={4}
                  className="rounded-xl resize-none"
                />
                <p className="text-[10px] text-muted-foreground">
                  Ces informations seront incluses dans le contexte de l'agent lors de chaque conversation.
                </p>
              </div>

              <Separator />

              {/* Model selection */}
              <div className="space-y-2">
                <Label className="flex items-center gap-1.5">
                  <Cpu className="h-3.5 w-3.5" />
                  Modèle IA
                </Label>
                <Select value={model} onValueChange={setModel}>
                  <SelectTrigger className="rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MODEL_OPTIONS.map((m) => (
                      <SelectItem key={m.value} value={m.value}>
                        {m.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[10px] text-muted-foreground">
                  « Automatique » sélectionne le meilleur modèle disponible selon la tâche.
                </p>
              </div>

              {/* Temperature slider */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Température</Label>
                  <span className="text-sm font-mono text-[#06b6d4]">{temperature.toFixed(1)}</span>
                </div>
                <Slider
                  value={[temperature]}
                  onValueChange={([val]) => setTemperature(val)}
                  min={0}
                  max={2}
                  step={0.1}
                />
                <div className="flex justify-between text-[10px] text-muted-foreground">
                  <span>0.0 — Précis</span>
                  <span>1.0 — Équilibré</span>
                  <span>2.0 — Créatif</span>
                </div>
              </div>

              {/* Summary card */}
              <div className="p-4 rounded-xl bg-muted/30 border border-border/50 space-y-3">
                <h4 className="text-sm font-semibold">Résumé de la configuration</h4>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="text-muted-foreground">Nom :</div>
                  <div className="font-medium">{name || '—'}</div>
                  <div className="text-muted-foreground">Objectif :</div>
                  <div className="font-medium">
                    {PURPOSE_OPTIONS.find((p) => p.value === purpose)?.label || '—'}
                  </div>
                  <div className="text-muted-foreground">Compétences :</div>
                  <div className="font-medium">
                    {selectedSkills.length} sélectionnée{selectedSkills.length !== 1 ? 's' : ''}
                  </div>
                  <div className="text-muted-foreground">Modèle :</div>
                  <div className="font-medium">
                    {MODEL_OPTIONS.find((m) => m.value === model)?.label || 'Automatique'}
                  </div>
                  <div className="text-muted-foreground">Température :</div>
                  <div className="font-medium">{temperature.toFixed(1)}</div>
                </div>
              </div>
            </div>
          </ScrollArea>

          {/* Footer buttons */}
          <div className="flex items-center justify-end gap-2 border-t px-6 py-3 mt-auto">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="rounded-xl"
            >
              Annuler
            </Button>
            <Button
              type="submit"
              disabled={loading || !name.trim()}
              className="rounded-xl bg-[#06b6d4] hover:bg-[#06b6d4]/90 text-white"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {editAgent ? 'Enregistrer' : "Créer l'agent"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

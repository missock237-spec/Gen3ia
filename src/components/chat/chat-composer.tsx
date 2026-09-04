"use client";

/**
 * ChatComposer — barre de saisie enrichie universelle (v4.1).
 *
 * Présente dans TOUS les chats du projet (tâches, agents, swarm, batch,
 * salon live). Fonctionnalités :
 *  - micro vocal : dictée Web Speech API (navigateur) avec repli
 *    MediaRecorder → /api/voice/transcribe (ASR réel côté serveur) ;
 *  - bouton d'envoi explicite (prompt vers l'agent IA) + touche Entrée ;
 *  - bouton multifonction « + » : import de TOUS types de fichiers
 *    (documents, images, vidéos, audio) via /api/chat/attachments
 *    (extraction PDF → RAG, transcription audio, HF Bucket) ET accès
 *    direct aux connecteurs (300+ apps, /connectors) ;
 *  - sélecteur de modèle (« Modèle ») alimenté par /api/models
 *    (registre réel, qualité apprise) avec option « Automatique »
 *    (Model Router intelligent).
 *
 * Aucun mock : chaque action a une implémentation réelle et des erreurs
 * explicites (toast). Le composant est contrôlé OU non-contrôlé.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useToast } from "@/hooks/use-toast";
import { useI18n } from "@/lib/i18n";
import { apiPostForm } from "@/lib/client/hooks";
import {
  Loader2, Mic, MicOff, Plus, Send, Sparkles, X,
  FileText, Image as ImageIcon, Video, AudioLines, ChevronDown, Cpu, Plug,
} from "lucide-react";

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export interface ComposerAttachment {
  id: string;
  kind: "IMAGE" | "VIDEO" | "AUDIO" | "DOCUMENT" | "FILE";
  filename: string;
  size: number;
  storage: string;
  textExtract?: string | null;
  documentId?: string | null;
  dictationId?: string | null;
}

export interface ComposerModel {
  id: string;
  provider: string;
  modelId: string;
  name: string;
  modality: string;
  supportedTasks: string[];
  qualityScore: number;
  contextLength: number;
}

export interface ChatComposerSubmit {
  text: string;
  attachments: ComposerAttachment[];
  /** null/undefined = Model Router automatique ; sinon "provider/model". */
  model: string | null;
}

interface ChatComposerProps {
  /** Mode contrôlé (optionnel). */
  value?: string;
  onChange?: (v: string) => void;
  /** Soumission (Entrée ou bouton envoyer). */
  onSend: (payload: ChatComposerSubmit) => void | Promise<void>;
  placeholder?: string;
  disabled?: boolean;
  /** Envoi en cours (spinner sur le bouton). */
  sending?: boolean;
  /** Libellé d'envoi spécifique (ex. « Lancer la tâche »). */
  sendLabel?: string;
  /** Liaison des pièces jointes à une tâche existante. */
  taskId?: string;
  /** Masquer le sélecteur de modèle (ex. salon live room-only). */
  showModelSelector?: boolean;
  /** Texte de saisie minimum pour activer l'envoi. */
  minLength?: number;
  /** L'agent est occupé (affiché dans le placeholder). */
  busyPlaceholder?: string;
  autoFocus?: boolean;
  /** Hauteur de saisie (lignes). */
  rows?: number;
  /** Valeur initiale non contrôlée (ex. pré-remplissage workflow). */
  defaultValue?: string;
}

// ─────────────────────────────────────────────────────────────
// Web Speech API — typage minimal (non standard mais répandu)
// ─────────────────────────────────────────────────────────────

interface SpeechRecognitionAlternativeLike {
  transcript: string;
}
interface SpeechRecognitionResultLike {
  0: SpeechRecognitionAlternativeLike;
  isFinal: boolean;
  length: number;
}
interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: { length: number; [i: number]: SpeechRecognitionResultLike };
}
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getSpeechRecognition(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

// ─────────────────────────────────────────────────────────────
// Composant
// ─────────────────────────────────────────────────────────────

const MAX_FILE_BYTES = 10 * 1024 * 1024;

const ATTACH_ACCEPTS: Record<"files" | "images" | "videos" | "audio", string> = {
  files: "*/*",
  images: "image/*",
  videos: "video/*",
  audio: "audio/*",
};

export function ChatComposer({
  value,
  onChange,
  onSend,
  placeholder,
  disabled = false,
  sending = false,
  sendLabel,
  taskId,
  showModelSelector = true,
  minLength = 1,
  busyPlaceholder,
  autoFocus = false,
  rows = 2,
  defaultValue,
}: ChatComposerProps) {
  // Valeur initiale (mode non contrôlé) : workflow pré-chargé.
  const [initial] = useState(defaultValue ?? "")

  const { t } = useI18n();
  const { toast } = useToast();
  const router = useRouter();

  // Éditeur (contrôlé ou non).
  const [internal, setInternal] = useState(initial);
  const text = value ?? internal;
  const setText = useCallback(
    (v: string) => {
      setInternal(v);
      onChange?.(v);
    },
    [onChange]
  );

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [attachments, setAttachments] = useState<ComposerAttachment[]>([]);
  const [uploading, setUploading] = useState(0);
  const [attachOpen, setAttachOpen] = useState(false);

  // Sélecteur de modèle.
  const [models, setModels] = useState<ComposerModel[] | null>(null);
  const [model, setModel] = useState<string | null>(null); // null = auto
  const [modelOpen, setModelOpen] = useState(false);

  // Dictée vocale.
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaChunksRef = useRef<Blob[]>([]);
  const [listening, setListening] = useState(false);
  const [transcribing, setTranscribing] = useState(false);

  const canSend =
    !disabled && !sending && (text.trim().length >= minLength || attachments.length > 0);
  const busy = uploading > 0 || transcribing;

  // Auto-resize du textarea (plafonné).
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, rows * 44 + 22)}px`;
  }, [text, rows]);

  // Chargement paresseux des modèles (une seule fois).
  useEffect(() => {
    if (!showModelSelector || models !== null) return;
    let cancelled = false;
    fetch("/api/models")
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (!cancelled && json?.models) setModels(json.models as ComposerModel[]);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [showModelSelector, models]);

  // Nettoyage de la reconnaissance au démontage.
  useEffect(() => {
    return () => {
      try { recognitionRef.current?.abort(); } catch { /* noop */ }
      try { mediaRecorderRef.current?.stop(); } catch { /* noop */ }
    };
  }, []);

  // ── Envoi ──────────────────────────────────────────────────

  async function handleSend() {
    if (!canSend) return;
    const payload: ChatComposerSubmit = { text: text.trim(), attachments, model };
    try {
      await onSend(payload);
      setText("");
      setAttachments([]);
    } catch {
      // L'appelant gère ses propres toasts d'échec.
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !disabled) {
      e.preventDefault();
      void handleSend();
    }
  }

  // ── Pièces jointes (tous types) ────────────────────────────

  async function uploadFiles(files: FileList | File[]) {
    setAttachOpen(false);
    for (const file of Array.from(files)) {
      if (file.size > MAX_FILE_BYTES) {
        toast({ title: t("input.errors.fileTooLarge"), variant: "destructive" });
        continue;
      }
      setUploading((n) => n + 1);
      try {
        const form = new FormData();
        form.append("file", file);
        if (taskId) form.append("taskId", taskId);
        const json = await apiPostForm<{ attachment: ComposerAttachment }>("/api/chat/attachments", form);
        if (!json.ok || !json.attachment) throw new Error(json.error ?? "upload");
        setAttachments((prev) => [...prev, json.attachment]);
        if (json.attachment.kind === "AUDIO" && json.attachment.textExtract) {
          // L'audio importé est déjà transcrit → injecté dans la saisie.
          setText(`${text ? text + " " : ""}${json.attachment.textExtract}`);
        }
      } catch (err) {
        toast({
          title: t("input.errors.uploadFailed"),
          description: err instanceof Error ? err.message : String(err),
          variant: "destructive",
        });
      } finally {
        setUploading((n) => n - 1);
      }
    }
  }

  function removeAttachment(id: string) {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
    fetch(`/api/chat/attachments?id=${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => undefined);
  }

  // ── Dictée vocale ──────────────────────────────────────────

  function currentLang(): string {
    // Langue du provider i18n (cookie gen3ia_lang) — repli navigateur.
    if (typeof document !== "undefined") {
      const cookie = document.cookie.split("; ").find((c) => c.startsWith("gen3ia_lang="));
      const lang = cookie?.split("=")[1];
      if (lang === "fr" || lang === "en") return lang === "fr" ? "fr-FR" : "en-US";
    }
    return typeof navigator !== "undefined" ? navigator.language : "fr-FR";
  }

  function startDictation() {
    if (listening) { stopDictation(); return; }
    const Ctor = getSpeechRecognition();
    if (Ctor) {
      try {
        const rec = new Ctor();
        rec.lang = currentLang();
        rec.continuous = true;
        rec.interimResults = false;
        rec.onresult = (e) => {
          let finalText = "";
          for (let i = e.resultIndex; i < e.results.length; i++) {
            if (e.results[i].isFinal) finalText += e.results[i][0].transcript;
          }
          if (finalText) setText(`${text ? text + " " : ""}${finalText.trim()}`);
        };
        rec.onerror = (e) => {
          if (e.error === "not-allowed" || e.error === "service-not-allowed") {
            toast({ title: t("voice.dictationUnsupported"), variant: "destructive" });
          }
          setListening(false);
        };
        rec.onend = () => setListening(false);
        recognitionRef.current = rec;
        rec.start();
        setListening(true);
        return;
      } catch {
        // repli MediaRecorder ci-dessous
      }
    }
    startMediaRecorderDictation();
  }

  function stopDictation() {
    try { recognitionRef.current?.stop(); } catch { /* noop */ }
    try { mediaRecorderRef.current?.stop(); } catch { /* noop */ }
    setListening(false);
  }

  /** Repli : capture MediaRecorder → transcription ASR serveur. */
  function startMediaRecorderDictation() {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      toast({ title: t("voice.dictationUnsupported"), variant: "destructive" });
      return;
    }
    navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then((stream) => {
        const mime = MediaRecorder.isTypeSupported("audio/webm")
          ? "audio/webm"
          : MediaRecorder.isTypeSupported("audio/mp4")
            ? "audio/mp4"
            : "";
        const rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
        mediaChunksRef.current = [];
        rec.ondataavailable = (e) => { if (e.data.size > 0) mediaChunksRef.current.push(e.data); };
        rec.onstop = async () => {
          stream.getTracks().forEach((tr) => tr.stop());
          const blob = new Blob(mediaChunksRef.current, { type: rec.mimeType || "audio/webm" });
          if (blob.size < 1024) return; // trop court — ignoré
          setTranscribing(true);
          try {
            const form = new FormData();
            form.append("file", new File([blob], "dictation.webm", { type: blob.type }));
            form.append("persist", "true");
            const json = await apiPostForm<{ text: string }>("/api/voice/transcribe", form);
            if (json.ok && json.text) {
              setText(`${text ? text + " " : ""}${json.text.trim()}`);
            } else {
              toast({ title: t("voice.errors.transcribeFailed"), variant: "destructive" });
            }
          } catch (err) {
            toast({
              title: t("voice.errors.transcribeFailed"),
              description: err instanceof Error ? err.message : String(err),
              variant: "destructive",
            });
          } finally {
            setTranscribing(false);
          }
        };
        mediaRecorderRef.current = rec;
        rec.start();
        setListening(true);
      })
      .catch(() => {
        toast({ title: t("voice.dictationUnsupported"), variant: "destructive" });
      });
  }

  // ── Rendu ──────────────────────────────────────────────────

  const selectedModel = models?.find((m) => `${m.provider}/${m.modelId}` === model);

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 shadow-lg focus-within:border-emerald-700/60 transition-colors">
      {/* Pièces jointes en attente */}
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-1.5 px-3 pt-3">
          {attachments.map((a) => (
            <span
              key={a.id}
              className="inline-flex items-center gap-1.5 rounded-full border border-zinc-700 bg-zinc-800/80 pl-2 pr-1 py-1 text-[11px] text-zinc-200 max-w-full"
            >
              {a.kind === "IMAGE" ? <ImageIcon className="h-3 w-3 shrink-0 text-purple-400" />
                : a.kind === "VIDEO" ? <Video className="h-3 w-3 shrink-0 text-sky-400" />
                : a.kind === "AUDIO" ? <AudioLines className="h-3 w-3 shrink-0 text-amber-400" />
                : <FileText className="h-3 w-3 shrink-0 text-emerald-400" />}
              <span className="truncate max-w-[160px]">{a.filename}</span>
              <button
                type="button"
                onClick={() => removeAttachment(a.id)}
                className="rounded-full p-0.5 hover:bg-zinc-700 text-zinc-500 hover:text-zinc-200"
                aria-label={t("input.removeAttachment")}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Saisie */}
      <textarea
        ref={textareaRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        autoFocus={autoFocus}
        rows={rows}
        placeholder={
          transcribing ? t("voice.listening")
          : busyPlaceholder && disabled ? busyPlaceholder
          : placeholder ?? t("input.placeholder")
        }
        className="w-full resize-none bg-transparent px-4 pt-3 pb-1 text-sm text-zinc-100 placeholder:text-zinc-500 outline-none disabled:opacity-50"
      />

      {/* Barre d'actions */}
      <div className="flex items-center gap-1.5 px-2.5 pb-2.5 pt-0.5">
        {/* Bouton multifonction « + » : connecteurs + import tous types */}
        <Popover open={attachOpen} onOpenChange={setAttachOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              disabled={disabled || busy}
              className="flex h-8 w-8 items-center justify-center rounded-full text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 disabled:opacity-40"
              aria-label={t("input.attach")}
              title={t("input.attach")}
            >
              {uploading > 0 ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-5 w-5" />}
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" side="top" className="w-64 border-zinc-800 bg-zinc-900 p-1.5">
            {/* Connecteurs — accès direct */}
            <button
              type="button"
              onClick={() => { setAttachOpen(false); router.push("/connectors"); }}
              className="flex w-full items-start gap-2.5 rounded-lg p-2.5 text-left hover:bg-zinc-800/80"
            >
              <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                <Plug className="h-3.5 w-3.5 text-emerald-400" />
              </span>
              <span className="min-w-0">
                <span className="block text-xs font-medium text-zinc-100">{t("input.attachMenu.connectors")}</span>
                <span className="block text-[11px] text-zinc-500">{t("input.attachMenu.connectorsDesc")}</span>
              </span>
            </button>
            <div className="mx-2.5 my-1 h-px bg-zinc-800" />
            {/* Imports fichiers — tous types */}
            {(
              [
                { key: "files" as const, icon: FileText, color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/20" },
                { key: "images" as const, icon: ImageIcon, color: "text-purple-400", bg: "bg-purple-500/10 border-purple-500/20" },
                { key: "videos" as const, icon: Video, color: "text-sky-400", bg: "bg-sky-500/10 border-sky-500/20" },
                { key: "audio" as const, icon: AudioLines, color: "text-amber-400", bg: "bg-amber-500/10 border-amber-500/20" },
              ] as const
            ).map(({ key, icon: Icon, color, bg: iconBg }) => (
              <label
                key={key}
                className="flex cursor-pointer items-start gap-2.5 rounded-lg p-2.5 hover:bg-zinc-800/80"
              >
                <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border ${iconBg}`}>
                  <Icon className={`h-3.5 w-3.5 ${color}`} />
                </span>
                <span className="min-w-0">
                  <span className="block text-xs font-medium text-zinc-100">{t(`input.attachMenu.${key}`)}</span>
                  <span className="block text-[11px] text-zinc-500">{t(`input.attachMenu.${key}Desc`)}</span>
                </span>
                <input
                  type="file"
                  multiple
                  accept={ATTACH_ACCEPTS[key]}
                  className="hidden"
                  disabled={disabled || busy}
                  onChange={(e) => {
                    if (e.target.files?.length) void uploadFiles(e.target.files);
                    e.target.value = "";
                  }}
                />
              </label>
            ))}
          </PopoverContent>
        </Popover>

        {/* Sélecteur de modèle */}
        {showModelSelector && (
          <Popover open={modelOpen} onOpenChange={setModelOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                disabled={disabled}
                className="inline-flex h-7 items-center gap-1 rounded-full border border-zinc-700 bg-zinc-800/70 px-2.5 text-[11px] font-medium text-zinc-300 hover:bg-zinc-800 disabled:opacity-40"
              >
                <Cpu className="h-3 w-3 text-emerald-400" />
                {selectedModel ? selectedModel.name : t("input.model")}
                <ChevronDown className="h-3 w-3 text-zinc-500" />
              </button>
            </PopoverTrigger>
            <PopoverContent align="start" side="top" className="w-72 border-zinc-800 bg-zinc-900 p-1.5 max-h-72 overflow-y-auto">
              <button
                type="button"
                onClick={() => { setModel(null); setModelOpen(false); }}
                className={`flex w-full items-start gap-2 rounded-lg p-2 text-left hover:bg-zinc-800/80 ${model === null ? "bg-emerald-950/40" : ""}`}
              >
                <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />
                <span className="min-w-0">
                  <span className="block text-xs font-medium text-zinc-100">{t("input.modelAuto")}</span>
                  <span className="block text-[11px] text-zinc-500">{t("input.modelAutoDesc")}</span>
                </span>
              </button>
              <div className="mx-2 my-1 h-px bg-zinc-800" />
              {(models ?? []).map((m) => {
                const key = `${m.provider}/${m.modelId}`;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => { setModel(key); setModelOpen(false); }}
                    className={`flex w-full items-start gap-2 rounded-lg p-2 text-left hover:bg-zinc-800/80 ${model === key ? "bg-emerald-950/40" : ""}`}
                  >
                    <Cpu className="mt-0.5 h-3.5 w-3.5 shrink-0 text-zinc-500" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-medium text-zinc-100">{m.name}</span>
                      <span className="block text-[10px] text-zinc-500 font-mono truncate">
                        {m.provider} · {m.modality}
                        {m.qualityScore > 0 ? ` · ${m.qualityScore.toFixed(2)}` : ""}
                      </span>
                    </span>
                  </button>
                );
              })}
              {models === null && (
                <div className="flex items-center justify-center p-3">
                  <Loader2 className="h-4 w-4 animate-spin text-zinc-600" />
                </div>
              )}
            </PopoverContent>
          </Popover>
        )}

        <div className="flex-1" />

        {/* Micro vocal */}
        <button
          type="button"
          onClick={listening ? stopDictation : startDictation}
          disabled={disabled}
          className={`flex h-8 w-8 items-center justify-center rounded-full transition-colors disabled:opacity-40 ${
            listening
              ? "bg-red-500/20 text-red-400 animate-pulse"
              : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
          }`}
          aria-label={listening ? t("voice.stopDictation") : t("input.mic")}
          title={listening ? t("voice.stopDictation") : t("input.mic")}
        >
          {transcribing ? <Loader2 className="h-4 w-4 animate-spin" /> : listening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
        </button>

        {/* Bouton envoyer */}
        <Button
          type="button"
          size="sm"
          onClick={() => void handleSend()}
          disabled={!canSend || busy}
          className="h-8 gap-1.5 rounded-full bg-emerald-500 px-4 text-xs font-semibold text-zinc-950 hover:bg-emerald-400 disabled:opacity-40"
        >
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
          {sendLabel ?? t("input.send")}
        </Button>
      </div>
    </div>
  );
}

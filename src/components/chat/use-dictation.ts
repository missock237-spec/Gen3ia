"use client";

/**
 * useDictation — hook de dictée vocale réutilisable (v4.1).
 *
 * Même moteur que le ChatComposer : Web Speech API (navigateur) avec
 * repli MediaRecorder → /api/voice/transcribe (ASR réel serveur).
 * Adapté aux champs Textarea/Input qui ne sont pas des chats complets
 * (batch multi-prompts, générateur multimédia…).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { useI18n } from "@/lib/i18n";
import { apiPostForm } from "@/lib/client/hooks";

// Typage minimal Web Speech API.
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

function currentLang(): string {
  if (typeof document !== "undefined") {
    const cookie = document.cookie.split("; ").find((c) => c.startsWith("gen3ia_lang="));
    const lang = cookie?.split("=")[1];
    if (lang === "fr" || lang === "en") return lang === "fr" ? "fr-FR" : "en-US";
  }
  return typeof navigator !== "undefined" ? navigator.language : "fr-FR";
}

export interface UseDictationResult {
  listening: boolean;
  transcribing: boolean;
  supported: boolean;
  toggle: () => void;
  stop: () => void;
}

/**
 * @param onText texte final reconnu (append à la valeur courante par l'appelant).
 */
export function useDictation(onText: (text: string) => void): UseDictationResult {
  const { t } = useI18n();
  const { toast } = useToast();

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaChunksRef = useRef<Blob[]>([]);
  const onTextRef = useRef(onText);
  onTextRef.current = onText;

  const [listening, setListening] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [supported] = useState(() => {
    if (typeof window === "undefined") return false;
    return Boolean(getSpeechRecognition()) || Boolean(navigator?.mediaDevices?.getUserMedia);
  });

  useEffect(() => {
    return () => {
      try { recognitionRef.current?.abort(); } catch { /* noop */ }
      try { mediaRecorderRef.current?.stop(); } catch { /* noop */ }
    };
  }, []);

  const stop = useCallback(() => {
    try { recognitionRef.current?.stop(); } catch { /* noop */ }
    try { mediaRecorderRef.current?.stop(); } catch { /* noop */ }
    setListening(false);
  }, []);

  const start = useCallback(() => {
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
          if (finalText) onTextRef.current(finalText.trim());
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
        // repli MediaRecorder
      }
    }
    // Repli : MediaRecorder → ASR serveur.
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
          if (blob.size < 1024) return;
          setTranscribing(true);
          try {
            const form = new FormData();
            form.append("file", new File([blob], "dictation.webm", { type: blob.type }));
            form.append("persist", "true");
            const json = await apiPostForm<{ text: string }>("/api/voice/transcribe", form);
            if (json.ok && json.text) onTextRef.current(json.text.trim());
            else toast({ title: t("voice.errors.transcribeFailed"), variant: "destructive" });
          } catch {
            toast({ title: t("voice.errors.transcribeFailed"), variant: "destructive" });
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
  }, [t, toast]);

  const toggle = useCallback(() => {
    if (listening) stop();
    else start();
  }, [listening, start, stop]);

  return { listening, transcribing, supported, toggle, stop };
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { LiveSignaling, ICE_SERVERS, type LiveSignal } from "@/lib/client/live-signaling";
import {
  Loader2, MonitorUp, PhoneOff, Copy, Radio, Users, MessageSquare, Bot, Eye,
  PictureInPicture2, PlayCircle, Sparkles,
} from "lucide-react";

/**
 * Salon live — diffusion d'écran temps réel (WebRTC P2P) + COPILOTE IA :
 *  - l'hôte partage son écran ; l'agent IA reçoit des captures périodiques
 *    (vision) et commente ce qu'il voit, même si l'utilisateur travaille
 *    dans une autre application ;
 *  - discussion directe avec l'agent (question + capture courante) ;
 *  - « /task <instruction> » : l'agent lance une VRAIE tâche GEN3IA qui
 *    s'exécute en arrière-plan serveur, progression affichée en direct ;
 *  - fenêtre flottante Picture-in-Picture : le chat reste visible par-dessus
 *    n'importe quelle application (GitHub, éditeur…).
 */

interface SessionInfo {
  id: string
  code: string
  title: string | null
  taskId: string | null
  status: string
  viewerCount: number
  createdAt: string
  host: { name: string; isMe: boolean }
  participants: Array<{ id: string; displayName: string; role: string; lastSeenAt: string }>
}

interface ChatMessage {
  from: string
  text: string
  at: string
  agent?: boolean
  vision?: boolean
}

interface LiveTaskInfo {
  taskId: string
  status: string
  currentPhase: string | null
  lastSteps: Array<{ title: string; status: string; phase: string }>
}

/** Déclarations Document Picture-in-Picture (Chrome/Edge 116+). */
declare global {
  interface Window {
    documentPictureInPicture?: {
      requestWindow(opts?: { width?: number; height?: number }): Promise<Window>
      window: Window | null
    }
  }
}

const TERMINAL_TASK_STATUSES = ["COMPLETED", "FAILED", "CANCELLED", "WAITING_FOR_HUMAN", "WAITING_PLAN_APPROVAL"];

export default function LiveRoomPage({ params }: { params: Promise<{ code: string }> }) {
  const { toast } = useToast()
  const [code, setCode] = useState<string | null>(null)
  const [session, setSession] = useState<SessionInfo | null>(null)
  const [role, setRole] = useState<"HOST" | "VIEWER" | null>(null)
  const [participantId, setParticipantId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [sharing, setSharing] = useState(false)
  const [streaming, setStreaming] = useState(false)
  const [connected, setConnected] = useState(false)
  const [ended, setEnded] = useState(false)
  const [chat, setChat] = useState<ChatMessage[]>([])
  const [chatInput, setChatInput] = useState("")
  const [signalingReady, setSignalingReady] = useState(false)

  // ─── Copilote IA ───
  const [agentActive, setAgentActive] = useState(false)
  const [agentBusy, setAgentBusy] = useState(false)
  const [agentIntervalSec, setAgentIntervalSec] = useState("10")
  const [agentTarget, setAgentTarget] = useState<"room" | "agent">("room")
  const [taskInfo, setTaskInfo] = useState<LiveTaskInfo | null>(null)
  const [pipOpen, setPipOpen] = useState(false)

  // Références WebRTC (hors re-render).
  const localStreamRef = useRef<MediaStream | null>(null)
  const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map())
  const signalingRef = useRef<LiveSignaling | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const remoteStreamRef = useRef<MediaStream | null>(null)

  // Références copilote (capture, boucle d'observation, polling tâche, PiP).
  const agentVideoRef = useRef<HTMLVideoElement | null>(null)
  const captureCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const observeTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const taskPollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const pipWindowRef = useRef<Window | null>(null)
  const agentBusyRef = useRef(false)
  const agentActiveRef = useRef(false)
  const chatScrollRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    agentBusyRef.current = agentBusy
  }, [agentBusy])
  useEffect(() => {
    agentActiveRef.current = agentActive
  }, [agentActive])

  // Défilement automatique du chat.
  useEffect(() => {
    chatScrollRef.current?.scrollTo({ top: chatScrollRef.current.scrollHeight })
  }, [chat])

  // ─────────────────────────────────────────────────────────────
  // Capture d'une frame de l'écran partagé (JPEG ~1280px, qualité 0.72)
  // ─────────────────────────────────────────────────────────────
  const captureFrame = useCallback((): string | null => {
    const video = agentVideoRef.current
    if (!video || !video.videoWidth || video.readyState < 2) return null
    let canvas = captureCanvasRef.current
    if (!canvas) {
      canvas = document.createElement("canvas")
      captureCanvasRef.current = canvas
    }
    const maxW = 1280
    const scale = Math.min(1, maxW / video.videoWidth)
    canvas.width = Math.round(video.videoWidth * scale)
    canvas.height = Math.round(video.videoHeight * scale)
    const ctx = canvas.getContext("2d")
    if (!ctx) return null
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    try {
      return canvas.toDataURL("image/jpeg", 0.72)
    } catch {
      return null
    }
  }, [])

  // ─────────────────────────────────────────────────────────────
  // Arrêt complet : signalisation, pistes locales, pairs, copilote
  // ─────────────────────────────────────────────────────────────
  const stopEverything = useCallback(() => {
    signalingRef.current?.stop()
    signalingRef.current = null
    localStreamRef.current?.getTracks().forEach((t) => t.stop())
    localStreamRef.current = null
    if (agentVideoRef.current) agentVideoRef.current.srcObject = null
    peersRef.current.forEach((pc) => pc.close())
    peersRef.current.clear()
    if (videoRef.current) videoRef.current.srcObject = null
    if (observeTimerRef.current) {
      clearInterval(observeTimerRef.current)
      observeTimerRef.current = null
    }
    if (taskPollRef.current) {
      clearInterval(taskPollRef.current)
      taskPollRef.current = null
    }
    pipWindowRef.current?.close()
    pipWindowRef.current = null
    setPipOpen(false)
    setSharing(false)
    setStreaming(false)
    setAgentActive(false)
    setSignalingReady(false)
  }, [])

  // ─────────────────────────────────────────────────────────────
  // Hôte : construit l'offre WebRTC pour un spectateur
  // ─────────────────────────────────────────────────────────────
  const createHostOffer = useCallback(
    async (viewerId: string) => {
      if (!localStreamRef.current) return
      const signaling = signalingRef.current
      if (!signaling) return
      const existing = peersRef.current.get(viewerId)
      if (existing) {
        existing.close()
        peersRef.current.delete(viewerId)
      }
      const pc = new RTCPeerConnection(ICE_SERVERS)
      peersRef.current.set(viewerId, pc)
      localStreamRef.current.getTracks().forEach((track) => {
        pc.addTrack(track, localStreamRef.current as MediaStream)
      })
      pc.onicecandidate = (ev) => {
        if (ev.candidate) void signaling.send("ICE", { candidate: ev.candidate.toJSON() }, viewerId)
      }
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)
      await signaling.send("OFFER", { sdp: pc.localDescription?.toJSON() }, viewerId)
    },
    []
  )

  // ─────────────────────────────────────────────────────────────
  // Polling de la tâche liée (hôte uniquement — propriétaire de la tâche)
  // + diffusion TASK aux spectateurs.
  // ─────────────────────────────────────────────────────────────
  const stopTaskPolling = useCallback(() => {
    if (taskPollRef.current) {
      clearInterval(taskPollRef.current)
      taskPollRef.current = null
    }
  }, [])

  const startTaskPolling = useCallback(
    (taskId: string) => {
      stopTaskPolling()
      taskPollRef.current = setInterval(() => {
        void (async () => {
          try {
            const res = await fetch(`/api/tasks/${taskId}`, { cache: "no-store" })
            const json = (await res.json()) as {
              ok: boolean
              task?: { status: string }
              steps?: Array<{ title: string; status: string; phase: string }>
            }
            if (!json.ok || !json.task) return
            const steps = (json.steps ?? []).slice(-4)
            setTaskInfo({
              taskId,
              status: json.task.status,
              currentPhase: steps.length ? steps[steps.length - 1].phase : null,
              lastSteps: steps.map((s) => ({ title: s.title, status: s.status, phase: s.phase })),
            })
            // Diffuse la progression aux spectateurs.
            signalingRef.current
              ?.send(
                "TASK",
                {
                  taskId,
                  status: json.task.status,
                  currentPhase: steps.length ? steps[steps.length - 1].phase : null,
                },
                null
              )
              .catch(() => undefined)
            if (TERMINAL_TASK_STATUSES.includes(json.task.status)) stopTaskPolling()
          } catch {
            /* réseau instable : nouvelle tentative au tick suivant */
          }
        })()
      }, 4000)
    },
    [stopTaskPolling]
  )

  // ─────────────────────────────────────────────────────────────
  // Traitant des signaux entrants (les deux rôles)
  // ─────────────────────────────────────────────────────────────
  const handleSignal = useCallback(
    async (s: LiveSignal) => {
      if (!participantId || !code) return
      const signaling = signalingRef.current

      // ── HÔTE : un spectateur arrive → créer une offre pour lui.
      if (role === "HOST" && s.type === "VIEWER_JOINED") {
        const viewerId = String(s.payload.participantId ?? s.fromId)
        await createHostOffer(viewerId)
        return
      }
      if (role === "HOST" && s.type === "VIEWER_LEFT") {
        const pc = peersRef.current.get(s.fromId)
        if (pc) {
          pc.close()
          peersRef.current.delete(s.fromId)
        }
        return
      }

      // ── SPECTATEUR : réception de l'offre de l'hôte.
      if (role === "VIEWER" && s.type === "OFFER") {
        let pc = peersRef.current.get(s.fromId)
        if (!pc) {
          pc = new RTCPeerConnection(ICE_SERVERS)
          peersRef.current.set(s.fromId, pc)
          pc.ontrack = (ev) => {
            remoteStreamRef.current = ev.streams[0]
            if (videoRef.current) {
              videoRef.current.srcObject = ev.streams[0]
              void videoRef.current.play().catch(() => undefined)
            }
            setConnected(true)
          }
          pc.onicecandidate = (ev) => {
            if (ev.candidate && signaling) {
              void signaling.send("ICE", { candidate: ev.candidate.toJSON() }, s.fromId)
            }
          }
        }
        await pc.setRemoteDescription(
          new RTCSessionDescription(s.payload.sdp as RTCSessionDescriptionInit)
        )
        const answer = await pc.createAnswer()
        await pc.setLocalDescription(answer)
        await signaling?.send("ANSWER", { sdp: pc.localDescription?.toJSON() }, s.fromId)
        return
      }

      // ── HÔTE : réception de la réponse du spectateur.
      if (role === "HOST" && s.type === "ANSWER") {
        const pc = peersRef.current.get(s.fromId)
        if (pc && pc.signalingState !== "stable") {
          await pc.setRemoteDescription(
            new RTCSessionDescription(s.payload.sdp as RTCSessionDescriptionInit)
          )
          setConnected(true)
        }
        return
      }

      // ── Les deux : candidats ICE.
      if (s.type === "ICE") {
        const pc = peersRef.current.get(s.fromId)
        if (pc) {
          await pc.addIceCandidate(new RTCIceCandidate(s.payload.candidate as RTCIceCandidateInit)).catch(() => undefined)
        }
        return
      }

      if (s.type === "CHAT") {
        setChat((c) => [
          ...c,
          { from: String(s.payload.displayName ?? "Invité"), text: String(s.payload.text ?? ""), at: s.createdAt },
        ])
        return
      }

      // ── Message du copilote IA (reçu par les spectateurs ; l'hôte
      //    reçoit sa réponse directement dans la réponse POST).
      if (s.type === "AGENT") {
        const p = s.payload as { text?: string; vision?: boolean; taskCreated?: string }
        setChat((c) => [
          ...c,
          {
            from: "Agent IA",
            text: String(p.text ?? ""),
            at: s.createdAt,
            agent: true,
            vision: Boolean(p.vision),
          },
        ])
        if (p.taskCreated && role === "HOST") {
          setTaskInfo({ taskId: p.taskCreated, status: "RUNNING", currentPhase: null, lastSteps: [] })
          startTaskPolling(p.taskCreated)
        }
        return
      }

      // ── Progression de tâche diffusée par l'hôte (spectateurs).
      if (s.type === "TASK") {
        const p = s.payload as { taskId?: string; status?: string; currentPhase?: string | null }
        if (p.taskId) {
          const tid = String(p.taskId)
          setTaskInfo((prev) =>
            prev
              ? { ...prev, status: p.status ?? prev.status, currentPhase: p.currentPhase ?? prev.currentPhase }
              : { taskId: tid, status: p.status ?? "RUNNING", currentPhase: p.currentPhase ?? null, lastSteps: [] }
          )
        }
        return
      }

      if (s.type === "BYE") {
        setEnded(true)
        stopEverything()
      }
    },
    [participantId, code, role, createHostOffer, startTaskPolling, stopEverything]
  )

  // ─────────────────────────────────────────────────────────────
  // Chargement initial : rejoindre + infos de session
  // ─────────────────────────────────────────────────────────────
  useEffect(() => {
    void (async () => {
      const { code: c } = await params
      setCode(c)
      try {
        // 1. Rejoint la session (rôle déterminé par le serveur).
        const joinRes = await fetch(`/api/live/${c}`, { method: "POST" })
        const join = (await joinRes.json()) as {
          ok: boolean
          role?: "HOST" | "VIEWER"
          participantId?: string
          error?: string
        }
        if (!join.ok) {
          toast({ title: "Session inaccessible", description: join.error, variant: "destructive" })
          setLoading(false)
          return
        }
        setRole(join.role ?? null)
        setParticipantId(join.participantId ?? null)

        // 2. Informations de session.
        const infoRes = await fetch(`/api/live/${c}`)
        const info = (await infoRes.json()) as { ok: boolean; session?: SessionInfo }
        if (info.ok && info.session) {
          setSession(info.session)
          // Tâche déjà liée à la session → suivi en direct (hôte seulement,
          // seul propriétaire de la tâche).
          if (info.session.taskId && join.role === "HOST" && info.session.host.isMe) {
            setTaskInfo({ taskId: info.session.taskId, status: "RUNNING", currentPhase: null, lastSteps: [] })
            startTaskPolling(info.session.taskId)
          }
        }
        setLoading(false)
      } catch {
        setLoading(false)
      }
    })()
  }, [params, toast, startTaskPolling])

  // ─────────────────────────────────────────────────────────────
  // Hôte : démarrage du partage d'écran (diffusion + copilote)
  // ─────────────────────────────────────────────────────────────
  async function startScreenShare() {
    if (!navigator.mediaDevices?.getDisplayMedia) {
      toast({
        title: "Partage indisponible",
        description: "Votre navigateur ne supporte pas getDisplayMedia (essayez Chrome/Edge desktop).",
        variant: "destructive",
      })
      return
    }
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 15 },
        audio: false,
      })
      localStreamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        void videoRef.current.play().catch(() => undefined)
      }
      stream.getVideoTracks()[0].addEventListener("ended", () => {
        void stopScreenShare()
      })
      setSharing(true)
      setStreaming(true)
      toast({ title: "Écran partagé", description: "Les spectateurs connectés voient maintenant votre écran." })

      // Démarre la signalisation si pas déjà active.
      if (!signalingRef.current && participantId) {
        const sig = new LiveSignaling({
          code: code as string,
          participantId,
          onSignal: (s) => void handleSignal(s),
          onEnded: () => setEnded(true),
        })
        signalingRef.current = sig
        setSignalingReady(true)
        sig.start()
      }

      // Offre immédiate aux spectateurs déjà présents.
      if (session?.participants) {
        for (const p of session.participants) {
          if (p.role === "VIEWER") await createHostOffer(p.id)
        }
      }
    } catch (err) {
      toast({
        title: "Partage annulé",
        description: err instanceof Error ? err.message : "Capture refusée.",
        variant: "destructive",
      })
    }
  }

  async function stopScreenShare() {
    localStreamRef.current?.getTracks().forEach((t) => t.stop())
    localStreamRef.current = null
    if (agentVideoRef.current) agentVideoRef.current.srcObject = null
    peersRef.current.forEach((pc) => pc.close())
    peersRef.current.clear()
    if (videoRef.current) videoRef.current.srcObject = null
    setSharing(false)
    setStreaming(false)
    setConnected(false)
    stopAgentShare()
  }

  // ─────────────────────────────────────────────────────────────
  // Copilote IA : partage de l'écran AVEC l'agent (vision périodique)
  // ─────────────────────────────────────────────────────────────
  async function startAgentShare() {
    if (agentActive) return
    // Le partage d'écran doit être actif : démarre-le sinon.
    if (!localStreamRef.current) {
      await startScreenShare()
      if (!localStreamRef.current) return
    }

    // Vidéo hors écran alimentée par le même flux (source des captures).
    let v = agentVideoRef.current
    if (!v) {
      v = document.createElement("video")
      v.muted = true
      v.playsInline = true
      agentVideoRef.current = v
    }
    v.srcObject = localStreamRef.current
    await v.play().catch(() => undefined)

    // La signalisation est requise pour le chat et la diffusion des réponses.
    if (!signalingRef.current && participantId && code) {
      const sig = new LiveSignaling({
        code,
        participantId,
        onSignal: (s) => void handleSignal(s),
        onEnded: () => setEnded(true),
      })
      signalingRef.current = sig
      setSignalingReady(true)
      sig.start()
    }

    setAgentActive(true)
    toast({
      title: "Copilote IA activé",
      description: `L'agent observe votre écran toutes les ${agentIntervalSec} s et commente ce qu'il voit. Discutez-lui en direct.`,
    })

    // Première observation après stabilisation du flux, puis boucle.
    setTimeout(() => {
      if (agentActiveRef.current) void callAgent("observe")
    }, 1800)

    observeTimerRef.current = setInterval(() => {
      // Ne capture pas quand l'onglet est masqué ou un appel est en cours.
      if (document.visibilityState === "visible" && !agentBusyRef.current && agentActiveRef.current) {
        void callAgent("observe")
      }
    }, Number(agentIntervalSec) * 1000)
  }

  function stopAgentShare() {
    if (observeTimerRef.current) {
      clearInterval(observeTimerRef.current)
      observeTimerRef.current = null
    }
    if (agentVideoRef.current) agentVideoRef.current.srcObject = null
    agentVideoRef.current = null
    setAgentActive(false)
  }

  // ─────────────────────────────────────────────────────────────
  // Appel au copilote (observe = commentaire auto ; chat = question)
  // ─────────────────────────────────────────────────────────────
  async function callAgent(mode: "chat" | "observe", message?: string) {
    if (!code || agentBusyRef.current) return
    if (mode === "chat" && !message?.trim() && !agentActive) return
    agentBusyRef.current = true
    setAgentBusy(true)
    try {
      const image = agentActiveRef.current ? captureFrame() ?? undefined : undefined
      const res = await fetch(`/api/live/${code}/agent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, message: message?.trim() || undefined, image }),
      })
      const json = (await res.json()) as {
        ok: boolean
        reply?: string
        taskId?: string
        taskStatus?: string
        credits?: number
        error?: string
      }
      if (!json.ok) {
        toast({ title: "Agent IA indisponible", description: json.error, variant: "destructive" })
        return
      }
      if (json.reply) {
        setChat((c) => [
          ...c,
          {
            from: "Agent IA",
            text: json.reply as string,
            at: new Date().toISOString(),
            agent: true,
            vision: Boolean(image),
          },
        ])
      }
      if (json.taskId) {
        setTaskInfo({ taskId: json.taskId, status: json.taskStatus ?? "RUNNING", currentPhase: null, lastSteps: [] })
        startTaskPolling(json.taskId)
      }
    } catch (err) {
      toast({
        title: "Erreur copilote",
        description: err instanceof Error ? err.message : "Appel impossible.",
        variant: "destructive",
      })
    } finally {
      agentBusyRef.current = false
      setAgentBusy(false)
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Fenêtre flottante Picture-in-Picture : le chat reste AU-DESSUS
  // de toutes les applications (GitHub, éditeur, navigateur…).
  // ─────────────────────────────────────────────────────────────
  async function openFloatingChat() {
    const dpip = window.documentPictureInPicture
    if (!dpip?.requestWindow) {
      toast({
        title: "Fenêtre flottante indisponible",
        description: "Document Picture-in-Picture nécessite Chrome/Edge 116+ sur ordinateur. Le chat reste disponible ici.",
        variant: "destructive",
      })
      return
    }
    if (pipWindowRef.current) {
      pipWindowRef.current.focus()
      return
    }
    try {
      const win = await dpip.requestWindow({ width: 420, height: 580 })
      pipWindowRef.current = win
      win.document.title = "GEN3IA — Chat live"
      win.document.body.style.cssText =
        "margin:0;background:#09090b;color:#f4f4f5;font-family:system-ui,sans-serif;overflow:hidden;"
      // Copie les feuilles de style de l'application.
      Array.from(document.styleSheets).forEach((sheet) => {
        try {
          const css = Array.from(sheet.cssRules).map((r) => r.cssText).join("\n")
          const style = win.document.createElement("style")
          style.textContent = css
          win.document.head.appendChild(style)
        } catch {
          if (sheet.href) {
            const link = win.document.createElement("link")
            link.rel = "stylesheet"
            link.href = sheet.href
            win.document.head.appendChild(link)
          }
        }
      })
      win.addEventListener("pagehide", () => {
        pipWindowRef.current = null
        setPipOpen(false)
      })
      setPipOpen(true)
    } catch (err) {
      toast({
        title: "Fenêtre flottante refusée",
        description: err instanceof Error ? err.message : "Ouverture impossible.",
        variant: "destructive",
      })
    }
  }

  // Spectateur : démarre la signalisation dès qu'il a rejoint.
  useEffect(() => {
    if (role === "VIEWER" && participantId && code && !signalingRef.current) {
      const sig = new LiveSignaling({
        code,
        participantId,
        onSignal: (s) => void handleSignal(s),
        onEnded: () => setEnded(true),
      })
      signalingRef.current = sig
      sig.start()
      // Marquage asynchrone : évite le setState synchrone dans l'effet.
      Promise.resolve().then(() => setSignalingReady(true))
    }
    return () => {
      signalingRef.current?.stop()
      signalingRef.current = null
    }
  }, [role, participantId, code])

  useEffect(() => {
    return () => {
      if (observeTimerRef.current) clearInterval(observeTimerRef.current)
      if (taskPollRef.current) clearInterval(taskPollRef.current)
      pipWindowRef.current?.close()
    }
  }, [])

  async function endSession() {
    if (code) await fetch(`/api/live/${code}`, { method: "DELETE" })
    stopEverything()
    setEnded(true)
  }

  async function sendChat() {
    const text = chatInput.trim().slice(0, 500)
    if (!text) return
    // Mode agent : la question part au copilote IA (avec capture éventuelle).
    const myName = session?.host.isMe ? "Hôte" : session?.participants.find((p) => p.id === participantId)?.displayName ?? "Moi"
    if (agentTarget === "agent") {
      setChat((c) => [...c, { from: myName, text, at: new Date().toISOString() }])
      setChatInput("")
      await callAgent("chat", text)
      return
    }
    if (!signalingRef.current || !participantId) return
    setChatInput("")
    // Le sondage exclut ses propres signaux : affichage local immédiat.
    setChat((c) => [...c, { from: myName, text, at: new Date().toISOString() }])
    await signalingRef.current.send("CHAT", { text, displayName: myName }, null)
  }

  function copyLink() {
    const url = `${window.location.origin}/live/${code}`
    void navigator.clipboard.writeText(url)
    toast({ title: "Lien copié", description: url })
  }

  // ─────────────────────────────────────────────────────────────
  // Panneau chat (élément JSX — utilisé par le salon ET la fenêtre
  // flottante PiP ; fonction retournant des éléments, pas un composant,
  // pour éviter tout remontage à chaque frappe).
  // ─────────────────────────────────────────────────────────────
  const chatPanelContent = (compact: boolean) => (
    <div className={compact ? "flex h-full min-h-0 flex-col" : "rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 lg:col-span-2"}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-zinc-500">
          <MessageSquare className="h-3.5 w-3.5" />
          {agentTarget === "agent" ? "Discussion avec l'agent IA" : "Chat de session"}
          {agentTarget === "agent" && agentActive && (
            <Badge variant="outline" className="border-emerald-800/60 text-emerald-300">
              <Eye className="mr-1 h-3 w-3" /> vision active
            </Badge>
          )}
        </h3>
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant={agentTarget === "room" ? "default" : "outline"}
            className={`h-6 px-2 text-[11px] ${agentTarget === "room" ? "bg-zinc-700 hover:bg-zinc-600" : "border-zinc-700"}`}
            onClick={() => setAgentTarget("room")}
          >
            Salon
          </Button>
          <Button
            size="sm"
            variant={agentTarget === "agent" ? "default" : "outline"}
            className={`h-6 px-2 text-[11px] ${agentTarget === "agent" ? "bg-emerald-500 text-zinc-950 hover:bg-emerald-400" : "border-zinc-700"}`}
            onClick={() => setAgentTarget("agent")}
          >
            <Bot className="mr-1 h-3 w-3" /> Agent IA
          </Button>
        </div>
      </div>
      <div
        ref={compact ? undefined : chatScrollRef}
        className={`mt-3 flex flex-col justify-end gap-1.5 overflow-y-auto ${compact ? "min-h-0 flex-1" : "max-h-48 min-h-16"}`}
      >
        {chat.length === 0 && <p className="text-xs text-zinc-600">Aucun message.</p>}
        {chat.map((m, i) => (
          <div key={i} className={`text-xs ${m.agent ? "rounded-lg bg-emerald-950/40 px-2.5 py-1.5" : ""}`}>
            <span className="font-medium text-emerald-400">
              {m.agent ? <Bot className="mr-1 inline h-3 w-3" /> : null}
              {m.from}
              {m.vision ? <Eye className="ml-1 inline h-3 w-3 text-emerald-500" /> : null}
            </span>
            <span className="ml-2 text-zinc-300">{m.text}</span>
          </div>
        ))}
        {agentBusy && (
          <div className="flex items-center gap-2 text-xs text-emerald-400">
            <Loader2 className="h-3 w-3 animate-spin" /> L'agent analyse l'écran…
          </div>
        )}
      </div>
      <div className={`mt-3 flex gap-2 ${compact ? "border-t border-zinc-800 pt-3" : ""}`}>
        <Input
          value={chatInput}
          onChange={(e) => setChatInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void sendChat()}
          placeholder={
            agentTarget === "agent"
              ? agentActive
                ? "Demandez à l'agent ce qu'il voit… /task <instruction> pour lancer une tâche"
                : "Activez le copilote pour que l'agent voie votre écran…"
              : "Message…"
          }
          className="bg-zinc-950 border-zinc-800"
          disabled={ended || (agentTarget === "agent" && agentBusy)}
        />
        <Button
          size="sm"
          variant="outline"
          disabled={ended || (agentTarget === "agent" ? agentBusy : !signalingReady)}
          onClick={() => void sendChat()}
          className={agentTarget === "agent" ? "border-emerald-800 text-emerald-300 hover:bg-emerald-950" : ""}
        >
          {agentTarget === "agent" ? <Sparkles className="h-4 w-4" /> : null}
          Envoyer
        </Button>
      </div>
    </div>
  )

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-500" />
      </div>
    )
  }

  if (!session) {
    return (
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-8 text-center">
        <h1 className="text-xl font-bold text-zinc-100">Session introuvable</h1>
        <p className="mt-2 text-sm text-zinc-400">Le code « {code} » ne correspond à aucune session live.</p>
        <Button variant="outline" className="mt-4" onClick={() => window.history.back()}>
          Retour
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Radio className={`h-6 w-6 ${ended ? "text-zinc-500" : connected || sharing ? "text-red-500" : "text-emerald-400"} ${!ended && (connected || sharing) ? "animate-pulse" : ""}`} />
          <div>
            <h1 className="text-xl font-bold tracking-tight">
              {session.title ?? "Session live"} <span className="font-mono text-sm text-zinc-500">{session.code}</span>
            </h1>
            <p className="text-xs text-zinc-500">
              Hôte : {session.host.name} · {session.viewerCount} spectateur{session.viewerCount > 1 ? "s" : ""}
              {role === "HOST" && " · vous diffusez"}
              {agentActive && " · copilote IA actif"}
            </p>
          </div>
          {!ended && <Badge variant="outline" className="border-red-800/60 text-red-300">EN DIRECT</Badge>}
          {ended && <Badge variant="outline" className="border-zinc-700 text-zinc-500">TERMINÉ</Badge>}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={copyLink}>
            <Copy className="h-4 w-4" /> Copier le lien
          </Button>
          <Button variant="outline" size="sm" onClick={() => void openFloatingChat()}>
            <PictureInPicture2 className="h-4 w-4" /> Chat flottant
          </Button>
          {role === "HOST" && !ended && (
            !sharing ? (
              <Button size="sm" onClick={() => void startScreenShare()} className="bg-emerald-500 text-zinc-950 hover:bg-emerald-400">
                <MonitorUp className="h-4 w-4" /> Partager mon écran
              </Button>
            ) : (
              <Button size="sm" variant="destructive" onClick={() => void stopScreenShare()}>
                Arrêter le partage
              </Button>
            )
          )}
          {!ended && (
            <Button size="sm" variant="destructive" onClick={() => void endSession()}>
              <PhoneOff className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Zone vidéo */}
      <div className="relative overflow-hidden rounded-2xl border border-zinc-800 bg-black">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          controls={false}
          muted={role === "HOST"}
          className="aspect-video w-full object-contain"
        />
        {!streaming && !connected && !ended && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-zinc-950/80 text-zinc-400">
            <MonitorUp className="h-10 w-10" />
            <p className="text-sm">
              {role === "HOST"
                ? "Cliquez « Partager mon écran » pour démarrer la diffusion."
                : "En attente de la diffusion de l'hôte…"}
            </p>
          </div>
        )}
        {ended && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-zinc-950/90 text-zinc-400">
            <PhoneOff className="h-10 w-10" />
            <p className="text-sm">La session est terminée.</p>
          </div>
        )}
        {(streaming || connected) && !ended && (
          <div className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-red-950/80 px-3 py-1 text-xs font-medium text-red-300">
            <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
            {role === "HOST" ? "VOUS DIFFUSEZ" : "EN DIRECT"}
          </div>
        )}
        {agentActive && !ended && (
          <div className="absolute right-3 top-3 flex items-center gap-1.5 rounded-full bg-emerald-950/80 px-3 py-1 text-xs font-medium text-emerald-300">
            <Bot className="h-3 w-3" /> L'AGENT VOIT VOTRE ÉCRAN
          </div>
        )}
      </div>

      {/* Copilote IA (hôte) */}
      {role === "HOST" && !ended && (
        <div className="rounded-xl border border-emerald-900/60 bg-emerald-950/20 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className={`flex h-10 w-10 items-center justify-center rounded-full ${agentActive ? "bg-emerald-500/20 text-emerald-300" : "bg-zinc-800 text-zinc-400"}`}>
                <Bot className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-zinc-100">Copilote IA — vision d'écran</h3>
                <p className="text-xs text-zinc-500">
                  {agentActive
                    ? `L'agent observe votre écran toutes les ${agentIntervalSec} s, explique ce qu'il voit et répond à vos questions — même si vous travaillez dans une autre application.`
                    : "Partagez votre écran avec l'agent : il commente en direct, explique ce qu'il crée, et corrige ce qui ne convient pas."}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Select value={agentIntervalSec} onValueChange={(v) => setAgentIntervalSec(v)} disabled={agentActive}>
                <SelectTrigger className="h-8 w-28 border-zinc-800 bg-zinc-950 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="border-zinc-800 bg-zinc-900">
                  <SelectItem value="8">toutes les 8 s</SelectItem>
                  <SelectItem value="10">toutes les 10 s</SelectItem>
                  <SelectItem value="15">toutes les 15 s</SelectItem>
                  <SelectItem value="30">toutes les 30 s</SelectItem>
                </SelectContent>
              </Select>
              {!agentActive ? (
                <Button size="sm" onClick={() => void startAgentShare()} className="bg-emerald-500 text-zinc-950 hover:bg-emerald-400">
                  <Eye className="h-4 w-4" /> Partager avec l'agent
                </Button>
              ) : (
                <Button size="sm" variant="destructive" onClick={stopAgentShare}>
                  Arrêter la vision
                </Button>
              )}
            </div>
          </div>
          {agentActive && (
            <div className="mt-3 flex items-center gap-2 rounded-lg bg-zinc-950/60 px-3 py-2 text-xs text-zinc-400">
              <PlayCircle className="h-3.5 w-3.5 text-emerald-400" />
              Astuce : tapez <code className="rounded bg-zinc-800 px-1 py-0.5 text-emerald-300">/task ton instruction</code> dans le chat Agent — l'agent exécute une vraie tâche GEN3IA en arrière-plan pendant que vous continuez à discuter.
            </div>
          )}
        </div>
      )}

      {/* Progression de la tâche liée */}
      {taskInfo && (
        <div className="rounded-xl border border-blue-900/60 bg-blue-950/20 p-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
              <PlayCircle className="h-4 w-4 text-blue-400" />
              Tâche en arrière-plan <span className="font-mono text-xs text-zinc-500">#{taskInfo.taskId.slice(0, 8)}</span>
            </h3>
            <Badge
              variant="outline"
              className={
                taskInfo.status === "COMPLETED"
                  ? "border-emerald-800 text-emerald-300"
                  : TERMINAL_TASK_STATUSES.includes(taskInfo.status)
                    ? "border-red-800 text-red-300"
                    : "border-blue-800 text-blue-300"
              }
            >
              {taskInfo.status}
            </Badge>
          </div>
          {taskInfo.lastSteps.length > 0 && (
            <div className="mt-3 space-y-1.5">
              {taskInfo.lastSteps.map((s, i) => (
                <div key={i} className="flex items-center gap-2 text-xs">
                  <span className={`h-1.5 w-1.5 rounded-full ${s.status === "COMPLETED" ? "bg-emerald-500" : s.status === "RUNNING" ? "bg-blue-400 animate-pulse" : "bg-zinc-600"}`} />
                  <span className="text-zinc-300">{s.title}</span>
                  <span className="ml-auto text-zinc-600">{s.phase} · {s.status}</span>
                </div>
              ))}
            </div>
          )}
          {role === "HOST" && taskInfo.status === "COMPLETED" && (
            <a href={`/tasks/${taskInfo.taskId}`} className="mt-3 inline-flex items-center gap-1 text-xs text-blue-300 hover:underline">
              Voir le résultat complet →
            </a>
          )}
        </div>
      )}

      {/* Participants + chat */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
          <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-zinc-500">
            <Users className="h-3.5 w-3.5" /> Participants
          </h3>
          <div className="mt-3 space-y-1.5">
            {session.participants.map((p) => (
              <div key={p.id} className="flex items-center gap-2 text-xs">
                <span className={`h-2 w-2 rounded-full ${p.role === "HOST" ? "bg-emerald-500" : "bg-blue-500"}`} />
                <span className="text-zinc-300">{p.displayName}</span>
                <span className="ml-auto text-zinc-600">{p.role === "HOST" ? "hôte" : "spectateur"}</span>
              </div>
            ))}
          </div>
        </div>
        {chatPanelContent(false)}
      </div>

      {/* Fenêtre flottante Picture-in-Picture (portal vers un autre document) */}
      {pipOpen && pipWindowRef.current && createPortal(pipWindowContent(), pipWindowRef.current.document.body)}

      <p className="text-[11px] leading-relaxed text-zinc-600">
        Flux vidéo chiffré de bout en bout (DTLS/SRTP) en P2P — le serveur ne relaie que la
        signalisation. Les captures envoyées au copilote IA sont traitées à la volée et ne
        sont jamais stockées. La session expire automatiquement à la fin de la diffusion.
      </p>
    </div>
  )

  /** Corps de la fenêtre flottante : chat + miniature de l'écran partagé
   *  (éléments JSX — pas de composant intermédiaire, zéro remontage). */
  function pipWindowContent() {
    return (
      <div className="flex h-screen w-full flex-col gap-2 overflow-hidden bg-zinc-950 p-3 text-zinc-100">
        <div className="flex items-center gap-2">
          <Radio className="h-4 w-4 text-red-500" />
          <span className="text-sm font-bold">{session?.title ?? "Session live"}</span>
          <span className="font-mono text-xs text-zinc-500">{session?.code}</span>
          {agentActive && <Badge variant="outline" className="ml-auto border-emerald-800 text-emerald-300">IA</Badge>}
        </div>
        {localStreamRef.current && (
          <video
            className="aspect-video w-full rounded-lg border border-zinc-800 object-contain"
            autoPlay
            playsInline
            muted
            ref={(el) => {
              if (el && localStreamRef.current && el.srcObject !== localStreamRef.current) {
                el.srcObject = localStreamRef.current
                void el.play().catch(() => undefined)
              }
            }}
          />
        )}
        <div className="min-h-0 flex-1">{chatPanelContent(true)}</div>
      </div>
    )
  }
}

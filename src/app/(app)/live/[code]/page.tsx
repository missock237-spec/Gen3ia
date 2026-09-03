"use client";

import { useCallback, useEffect, useRef, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { useToast } from "@/hooks/use-toast"
import { LiveSignaling, ICE_SERVERS, type LiveSignal } from "@/lib/client/live-signaling"
import { Loader2, MonitorUp, PhoneOff, Copy, Radio, Users, MessageSquare } from "lucide-react"

/**
 * Salon live — partage d'écran temps réel (WebRTC P2P).
 * L'hôte diffuse son écran ; les spectateurs le voient en direct.
 * Fonctionne sur n'importe quelle session live (tâche liée ou non).
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
}

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

  // Références WebRTC (hors re-render).
  const localStreamRef = useRef<MediaStream | null>(null)
  const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map())
  const signalingRef = useRef<LiveSignaling | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const remoteStreamRef = useRef<MediaStream | null>(null)

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
        if (info.ok && info.session) setSession(info.session)
        setLoading(false)
      } catch {
        setLoading(false)
      }
    })()
     
  }, [params])

  // ─────────────────────────────────────────────────────────────
  // Arrêt complet : signalisation, pistes locales, pairs
  // ─────────────────────────────────────────────────────────────
  const stopEverything = useCallback(() => {
    signalingRef.current?.stop()
    signalingRef.current = null
    localStreamRef.current?.getTracks().forEach((t) => t.stop())
    localStreamRef.current = null
    peersRef.current.forEach((pc) => pc.close())
    peersRef.current.clear()
    if (videoRef.current) videoRef.current.srcObject = null
    setSharing(false)
    setStreaming(false)
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
      if (s.type === "BYE") {
        setEnded(true)
        stopEverything()
      }
    },
     
    [participantId, code, role]
  )

  // ─────────────────────────────────────────────────────────────
  // Hôte : démarrage du partage d'écran
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
    peersRef.current.forEach((pc) => pc.close())
    peersRef.current.clear()
    if (videoRef.current) videoRef.current.srcObject = null
    setSharing(false)
    setStreaming(false)
    setConnected(false)
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

  async function endSession() {
    if (code) await fetch(`/api/live/${code}`, { method: "DELETE" })
    stopEverything()
    setEnded(true)
  }

  async function sendChat() {
    if (!chatInput.trim() || !signalingRef.current || !participantId) return
    const text = chatInput.trim().slice(0, 500)
    setChatInput("")
    await signalingRef.current.send("CHAT", { text, displayName: session?.host.isMe ? "Hôte" : "Moi" }, null)
  }

  function copyLink() {
    const url = `${window.location.origin}/live/${code}`
    void navigator.clipboard.writeText(url)
    toast({ title: "Lien copié", description: url })
  }

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
            </p>
          </div>
          {!ended && <Badge variant="outline" className="border-red-800/60 text-red-300">EN DIRECT</Badge>}
          {ended && <Badge variant="outline" className="border-zinc-700 text-zinc-500">TERMINÉ</Badge>}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={copyLink}>
            <Copy className="h-4 w-4" /> Copier le lien
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
      </div>

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
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 lg:col-span-2">
          <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-zinc-500">
            <MessageSquare className="h-3.5 w-3.5" /> Chat de session
          </h3>
          <div className="mt-3 flex max-h-48 min-h-16 flex-col justify-end gap-1.5 overflow-y-auto">
            {chat.length === 0 && <p className="text-xs text-zinc-600">Aucun message.</p>}
            {chat.map((m, i) => (
              <div key={i} className="text-xs">
                <span className="font-medium text-emerald-400">{m.from}</span>
                <span className="ml-2 text-zinc-300">{m.text}</span>
              </div>
            ))}
          </div>
          <div className="mt-3 flex gap-2">
            <Input
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void sendChat()}
              placeholder="Message…"
              className="bg-zinc-950 border-zinc-800"
              disabled={ended}
            />
            <Button size="sm" variant="outline" disabled={ended || !signalingReady} onClick={() => void sendChat()}>
              Envoyer
            </Button>
          </div>
        </div>
      </div>

      <p className="text-[11px] leading-relaxed text-zinc-600">
        Flux vidéo chiffré de bout en bout (DTLS/SRTP) en P2P — le serveur ne relaie que la
        signalisation. La session expire automatiquement à la fin de la diffusion.
      </p>
    </div>
  )
}

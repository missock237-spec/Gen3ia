"use client";

/**
 * Client de signalisation WebRTC pour le mode live GEN3IA.
 * Long-poll (≤20 s) + envoi de signaux (SDP, ICE, BYE, CHAT).
 * Le flux média voyage en P2P chiffré (DTLS/SRTP) — le serveur
 * ne relaie QUE la signalisation.
 */

export type SignalType =
  | "OFFER"
  | "ANSWER"
  | "ICE"
  | "BYE"
  | "CHAT"
  | "VIEWER_JOINED"
  | "VIEWER_LEFT"
  | "AGENT" // message du copilote IA (émis côté serveur)
  | "TASK" // progression de la tâche liée (diffusée par l'hôte)

export interface LiveSignal {
  id: string
  fromId: string
  type: SignalType
  payload: Record<string, unknown>
  createdAt: string
}

export class LiveSignaling {
  private code: string
  private participantId: string
  private since: string
  private stopped = false
  private onSignal: (s: LiveSignal) => void
  private onEnded: () => void

  constructor(opts: {
    code: string
    participantId: string
    onSignal: (s: LiveSignal) => void
    onEnded?: () => void
  }) {
    this.code = opts.code
    this.participantId = opts.participantId
    this.onSignal = opts.onSignal
    this.onEnded = opts.onEnded ?? (() => {})
    this.since = new Date(Date.now() - 5_000).toISOString()
  }

  /** Boucle de long-poll — s'arrête via stop(). */
  start(): void {
    void this.loop()
  }

  stop(): void {
    this.stopped = true
  }

  private async loop(): Promise<void> {
    while (!this.stopped) {
      try {
        const res = await fetch(
          `/api/live/${this.code}/signal?since=${encodeURIComponent(this.since)}&participant=${this.participantId}`,
          { cache: "no-store" }
        )
        if (!res.ok) {
          if (res.status === 403 || res.status === 404) {
            this.onEnded()
            this.stop()
            return
          }
          await new Promise((r) => setTimeout(r, 3_000))
          continue
        }
        const json = (await res.json()) as {
          ok: boolean
          signals?: LiveSignal[]
          now?: string
          sessionStatus?: string
        }
        if (json.sessionStatus === "ENDED") {
          this.onEnded()
          this.stop()
          return
        }
        if (json.signals?.length) {
          for (const s of json.signals) this.onSignal(s)
        }
        if (json.now) this.since = json.now
      } catch {
        // Réseau instable : nouvelle tentative après pause.
        await new Promise((r) => setTimeout(r, 3_000))
      }
    }
  }

  /** Publie un signal vers un pair (ou en diffusion si toId = null). */
  async send(type: SignalType, payload: Record<string, unknown>, toId: string | null): Promise<void> {
    await fetch(`/api/live/${this.code}/signal`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fromId: this.participantId, toId, type, payload }),
    })
  }
}

/** Configuration ICE : STUN public Google (trous NAT), sans relais TURN (P2P direct). */
export const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
  ],
}

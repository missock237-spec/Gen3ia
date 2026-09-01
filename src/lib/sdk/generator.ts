import { getAppUrl } from "@/lib/config"

/**
 * SDK Generator — produit le code source des SDK JavaScript/TypeScript et
 * Python pour interroger un agent publié via l'API publique v1.
 */

export interface SdkContext {
  agentSlug: string
  endpoint: string
}

export function jsSdkCode(ctx: SdkContext): string {
  return `/**
 * SDK GEN3IA — JavaScript/TypeScript
 * Agent : ${ctx.agentSlug}
 * Installation : aucune dépendance requise (fetch natif, Node 18+).
 */
const BASE_URL = process.env.GEN3IA_URL || "${ctx.endpoint.replace(/\/v1\/.*$/, "")}";
const API_KEY = process.env.GEN3IA_API_KEY; // g3ia_live_...

export class Gen3iaClient {
  constructor({ apiKey = API_KEY, baseUrl = BASE_URL } = {}) {
    if (!apiKey) throw new Error("GEN3IA_API_KEY manquante");
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
  }

  async chat(message, { agentSlug = "${ctx.agentSlug}", history = [] } = {}) {
    const res = await fetch(this.baseUrl + "/v1/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + this.apiKey },
      body: JSON.stringify({ message, agent_slug: agentSlug, history }),
    });
    if (!res.ok) throw new Error("GEN3IA " + res.status + " : " + (await res.text()));
    return res.json();
  }

  async runTask(prompt, { agentSlug = "${ctx.agentSlug}", wait = true, pollMs = 2000 } = {}) {
    const res = await fetch(this.baseUrl + "/v1/task", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + this.apiKey },
      body: JSON.stringify({ prompt, agent_slug: agentSlug, mode: "async" }),
    });
    if (!res.ok) throw new Error("GEN3IA " + res.status + " : " + (await res.text()));
    const { task_id } = await res.json();
    if (!wait) return { taskId: task_id };
    for (;;) {
      const r = await fetch(this.baseUrl + "/v1/task/" + task_id, {
        headers: { Authorization: "Bearer " + this.apiKey },
      });
      const task = await r.json();
      if (["COMPLETED", "FAILED", "CANCELLED"].includes(task.status)) return task;
      await new Promise((r) => setTimeout(r, pollMs));
    }
  }
}

// Exemple :
// const client = new Gen3iaClient();
// const { answer } = await client.chat("Bonjour, présente-toi.");
`
}

export function pythonSdkCode(ctx: SdkContext): string {
  return `"""
SDK GEN3IA — Python
Agent : ${ctx.agentSlug}
Installation : aucune dépendance requise (urllib, Python 3.9+).
"""
import json
import os
import time
import urllib.request

BASE_URL = os.environ.get("GEN3IA_URL", "${ctx.endpoint.replace(/\/v1\/.*$/, "")}")
API_KEY = os.environ.get("GEN3IA_API_KEY")  # g3ia_live_...


class Gen3iaClient:
    def __init__(self, api_key=None, base_url=None):
        if not (api_key or API_KEY):
            raise ValueError("GEN3IA_API_KEY manquante")
        self.api_key = api_key or API_KEY
        self.base_url = base_url or BASE_URL

    def _request(self, method, path, payload=None):
        data = json.dumps(payload).encode() if payload is not None else None
        req = urllib.request.Request(
            self.base_url + path,
            data=data,
            method=method,
            headers={"Content-Type": "application/json", "Authorization": "Bearer " + self.api_key},
        )
        with urllib.request.urlopen(req) as res:
            return json.loads(res.read().decode())

    def chat(self, message, agent_slug="${ctx.agentSlug}", history=None):
        return self._request("POST", "/v1/chat", {
            "message": message,
            "agent_slug": agent_slug,
            "history": history or [],
        })

    def run_task(self, prompt, agent_slug="${ctx.agentSlug}", wait=True, poll_s=2.0):
        task = self._request("POST", "/v1/task", {
            "prompt": prompt,
            "agent_slug": agent_slug,
            "mode": "async",
        })
        task_id = task["task_id"]
        if not wait:
            return task_id
        while True:
            task = self._request("GET", "/v1/task/" + task_id)
            if task["status"] in ("COMPLETED", "FAILED", "CANCELLED"):
                return task
            time.sleep(poll_s)


# Exemple :
# client = Gen3iaClient()
# print(client.chat("Bonjour, présente-toi.")["answer"])
`
}

export function curlExample(ctx: SdkContext): string {
  return `curl -X POST ${ctx.endpoint}/chat \\
  -H "Authorization: Bearer g3ia_live_VOTRE_CLE" \\
  -H "Content-Type: application/json" \\
  -d '{"message": "Bonjour, présente-toi.", "agent_slug": "${ctx.agentSlug}"}'`
}

export function endpointForAgent(agentSlug: string): string {
  return `${getAppUrl()}/api/v1`
}

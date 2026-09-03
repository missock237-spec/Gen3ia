"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { usePolling } from "@/lib/client/hooks";
import { useI18n } from "@/lib/i18n";
import type { TranslationKey } from "@/lib/i18n/dictionaries";
import { Code2, Copy, Check, Download, Terminal, BookOpen } from "lucide-react";

function jsSdkSource(t: (key: TranslationKey) => string): string {
  return `/**
 * ${t("sdk.code.js.header")}
 */
const BASE_URL = process.env.GEN3IA_URL || "https://votre-deploiement.vercel.app";
const API_KEY = process.env.GEN3IA_API_KEY; // g3ia_live_...

export class Gen3iaClient {
  constructor({ apiKey = API_KEY, baseUrl = BASE_URL } = {}) {
    if (!apiKey) throw new Error("GEN3IA_API_KEY manquante");
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
  }

  // ${t("sdk.code.js.chat")}
  async chat(message, { agentSlug, history = [] } = {}) {
    const res = await fetch(this.baseUrl + "/api/v1/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + this.apiKey,
      },
      body: JSON.stringify({ message, agent_slug: agentSlug, history }),
    });
    if (!res.ok) throw new Error("GEN3IA " + res.status + " : " + (await res.text()));
    return res.json();
  }

  // ${t("sdk.code.js.task")}
  async runTask(prompt, { agentSlug, wait = true, pollMs = 2000 } = {}) {
    const res = await fetch(this.baseUrl + "/api/v1/task", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + this.apiKey,
      },
      body: JSON.stringify({ prompt, agent_slug: agentSlug, mode: "async" }),
    });
    if (!res.ok) throw new Error("GEN3IA " + res.status + " : " + (await res.text()));
    const { task_id } = await res.json();
    if (!wait) return { taskId: task_id };

    // ${t("sdk.code.js.poll")}
    for (;;) {
      const r = await fetch(this.baseUrl + "/api/v1/task/" + task_id, {
        headers: { Authorization: "Bearer " + this.apiKey },
      });
      const task = await r.json();
      if (["COMPLETED", "FAILED", "CANCELLED"].includes(task.status)) return task;
      await new Promise((resolve) => setTimeout(resolve, pollMs));
    }
  }
}

// ${t("sdk.code.example")}
// const client = new Gen3iaClient();
// const { answer } = await client.chat("Résume les actus IA du jour", { agentSlug: "analyste" });
// const result = await client.runTask("Analyse le marché solaire au Sénégal");
// console.log(result.result.answer, result.result.verification);`;
}

function pySdkSource(t: (key: TranslationKey) => string): string {
  return `"""
${t("sdk.code.py.header")}
"""
import json
import os
import time
import urllib.request

BASE_URL = os.environ.get("GEN3IA_URL", "https://votre-deploiement.vercel.app")
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
            headers={
                "Content-Type": "application/json",
                "Authorization": "Bearer " + self.api_key,
            },
        )
        with urllib.request.urlopen(req) as res:
            return json.loads(res.read().decode())

    def chat(self, message, agent_slug=None, history=None):
        """${t("sdk.code.py.chat")}"""
        return self._request("POST", "/api/v1/chat", {
            "message": message,
            "agent_slug": agent_slug,
            "history": history or [],
        })

    def run_task(self, prompt, agent_slug=None, wait=True, poll_s=2.0):
        """${t("sdk.code.py.task")}"""
        task = self._request("POST", "/api/v1/task", {
            "prompt": prompt,
            "agent_slug": agent_slug,
            "mode": "async",
        })
        task_id = task["task_id"]
        if not wait:
            return task_id
        while True:
            task = self._request("GET", "/api/v1/task/" + task_id)
            if task["status"] in ("COMPLETED", "FAILED", "CANCELLED"):
                return task
            time.sleep(poll_s)


# ${t("sdk.code.example")}
# client = Gen3iaClient()
# print(client.chat("Bonjour")["answer"])
# result = client.run_task("Analyse le marché solaire au Sénégal")
# print(result["result"]["answer"])`;
}

function CodeBlock({ code, language }: { code: string; language: string }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  return (
    <div className="relative rounded-lg border border-zinc-800 bg-zinc-950 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-zinc-800 bg-zinc-900/60">
        <span className="text-xs font-mono text-zinc-500">{language}</span>
        <div className="flex items-center gap-2">
          <Button
            size="sm" variant="ghost"
            className="h-7 text-zinc-400 hover:text-white"
            onClick={() => {
              void navigator.clipboard.writeText(code)
              setCopied(true)
              setTimeout(() => setCopied(false), 2000)
            }}
          >
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
            <span className="text-xs ml-1">{copied ? t("sdk.copied") : t("sdk.copy")}</span>
          </Button>
          <Button
            size="sm" variant="ghost"
            className="h-7 text-zinc-400 hover:text-white"
            onClick={() => {
              const blob = new Blob([code], { type: "text/plain" })
              const url = URL.createObjectURL(blob)
              const a = document.createElement("a")
              a.href = url
              a.download = language === "JavaScript" ? "gen3ia-sdk.js" : "gen3ia-sdk.py"
              a.click()
              URL.revokeObjectURL(url)
            }}
          >
            <Download className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
      <pre className="p-4 overflow-x-auto text-xs leading-relaxed text-zinc-300 font-mono max-h-[560px] overflow-y-auto">
        {code}
      </pre>
    </div>
  )
}

export default function SdkPage() {
  const { t } = useI18n();
  const { data, loading } = usePolling<{ ok: boolean; agents: { slug: string; name: string; status: string }[] }>("/api/agents");
  const published = (data?.agents ?? []).filter((a) => a.status === "PUBLISHED");

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Code2 className="h-6 w-6 text-emerald-400" /> {t("sdk.title")}
        </h1>
        <p className="text-sm text-zinc-400 mt-1">
          {t("sdk.subtitle")}
        </p>
      </div>

      <Card className="bg-zinc-900/40 border-zinc-800">
        <CardHeader>
          <CardTitle className="text-base">{t("sdk.configuration")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-zinc-300">
          <div className="font-mono text-xs bg-zinc-950 border border-zinc-800 rounded-lg p-3 space-y-1">
            <div><span className="text-emerald-400">GEN3IA_URL</span> = {t("sdk.config.url")}</div>
            <div><span className="text-emerald-400">GEN3IA_API_KEY</span> = {t("sdk.config.key")}</div>
          </div>
          {loading ? (
            <Skeleton className="h-4 w-48 bg-zinc-800/60" />
          ) : published.length > 0 ? (
            <p className="text-xs text-zinc-500">
              {t("sdk.publishedAgents")} {published.map((a) => (
                <code key={a.slug} className="text-emerald-400/80 font-mono mr-2">{a.slug}</code>
              ))}
            </p>
          ) : (
            <p className="text-xs text-zinc-500">
              {t("sdk.noPublished")}
            </p>
          )}
        </CardContent>
      </Card>

      <Tabs defaultValue="js" className="w-full">
        <TabsList className="bg-zinc-900/60 border border-zinc-800">
          <TabsTrigger value="js" className="data-[state=active]:bg-emerald-500/15 data-[state=active]:text-emerald-300">
            <Terminal className="h-3.5 w-3.5 mr-1.5" />JavaScript / TypeScript
          </TabsTrigger>
          <TabsTrigger value="py" className="data-[state=active]:bg-emerald-500/15 data-[state=active]:text-emerald-300">
            <BookOpen className="h-3.5 w-3.5 mr-1.5" />Python
          </TabsTrigger>
        </TabsList>
        <TabsContent value="js">
          <CodeBlock code={jsSdkSource(t)} language="JavaScript" />
        </TabsContent>
        <TabsContent value="py">
          <CodeBlock code={pySdkSource(t)} language="Python" />
        </TabsContent>
      </Tabs>

      <Card className="bg-zinc-900/40 border-zinc-800">
        <CardHeader>
          <CardTitle className="text-base">{t("sdk.apiReference")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="space-y-1.5">
            <div className="font-mono text-emerald-400 text-xs">POST /api/v1/chat</div>
            <p className="text-xs text-zinc-400">{t("sdk.endpoint.chat.desc")}</p>
          </div>
          <div className="space-y-1.5">
            <div className="font-mono text-emerald-400 text-xs">POST /api/v1/task</div>
            <p className="text-xs text-zinc-400">{t("sdk.endpoint.task.desc")}</p>
          </div>
          <div className="space-y-1.5">
            <div className="font-mono text-emerald-400 text-xs">GET /api/v1/task/{"{id}"}</div>
            <p className="text-xs text-zinc-400">{t("sdk.endpoint.get.desc")}</p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useToast } from "@/hooks/use-toast"
import { apiPost } from "@/lib/client/hooks"
import { Bug, RefreshCw, Play, Sliders, Code2, Sparkles, Loader2, ArrowRight } from "lucide-react"

export interface DebugReplayProps {
  task: {
    id: string
    prompt: string
    status: string
    analysis?: any
    plans?: any
    executionLog?: any
  }
  steps?: any[]
  onReplayed?: (newTask: any) => void
}

export function DebugReplay({ task, steps = [], onReplayed }: DebugReplayProps) {
  const { toast } = useToast()
  const [replaying, setReplaying] = useState(false)
  const [activeTab, setActiveTab] = useState("prompt")

  // Valeurs injectées
  const [modifiedPrompt, setModifiedPrompt] = useState(task.prompt)
  const [injectedAnalysisJson, setInjectedAnalysisJson] = useState(
    task.analysis ? JSON.stringify(task.analysis, null, 2) : ""
  )
  const [injectedPlansJson, setInjectedPlansJson] = useState(
    task.plans ? JSON.stringify(task.plans, null, 2) : ""
  )

  const handleReplay = async () => {
    setReplaying(true)
    try {
      let parsedAnalysis = undefined
      if (injectedAnalysisJson.trim()) {
        try {
          parsedAnalysis = JSON.parse(injectedAnalysisJson)
        } catch {
          throw new Error("JSON d'analyse invalide")
        }
      }

      let parsedPlans = undefined
      if (injectedPlansJson.trim()) {
        try {
          parsedPlans = JSON.parse(injectedPlansJson)
        } catch {
          throw new Error("JSON des plans invalide")
        }
      }

      const res = await apiPost(`/api/tasks/${task.id}/replay`, {
        modifiedPrompt: modifiedPrompt !== task.prompt ? modifiedPrompt : undefined,
        injectedAnalysis: parsedAnalysis,
        injectedPlans: parsedPlans,
      })

      if (!res.ok) throw new Error(res.error)

      toast({
        title: "Rejeu de tâche initié !",
        description: `Nouvelle tâche créée avec l'ID ${res.task.id.slice(0, 10)}...`,
      })

      if (onReplayed && res.task) {
        onReplayed(res.task)
      } else if (res.task) {
        window.location.href = `/tasks/${res.task.id}`
      }
    } catch (err) {
      toast({
        title: "Erreur lors du rejeu",
        description: err instanceof Error ? err.message : "Échec du rejeu",
        variant: "destructive",
      })
    } finally {
      setReplaying(false)
    }
  }

  return (
    <Card className="border-amber-500/30 bg-zinc-950/90 shadow-2xl">
      <CardHeader className="pb-3 border-b border-zinc-800/80">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Bug className="h-5 w-5 text-amber-400" />
            <CardTitle className="text-base font-semibold text-zinc-100">
              Mode Débug Avancé — Rejeu & Injection de Valeurs
            </CardTitle>
          </div>
          <Badge variant="outline" className="border-amber-500/30 text-amber-300 font-mono text-[10px]">
            Replay Mode
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="pt-4 space-y-4">
        <p className="text-xs text-zinc-400 leading-relaxed">
          Rejouez cette tâche à n'importe quelle phase en modifiant le prompt, l'analyse ou les plans d'exécution.
        </p>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="bg-zinc-900 border border-zinc-800 grid grid-cols-3">
            <TabsTrigger value="prompt" className="text-xs data-[state=active]:bg-zinc-800">
              Prompt Modifié
            </TabsTrigger>
            <TabsTrigger value="analysis" className="text-xs data-[state=active]:bg-zinc-800">
              Analyse Injectée
            </TabsTrigger>
            <TabsTrigger value="plans" className="text-xs data-[state=active]:bg-zinc-800">
              Plans Injectés
            </TabsTrigger>
          </TabsList>

          <TabsContent value="prompt" className="space-y-3 pt-3">
            <div>
              <Label className="text-xs text-zinc-400">Prompt d'entrée (Override)</Label>
              <Textarea
                value={modifiedPrompt}
                onChange={(e) => setModifiedPrompt(e.target.value)}
                className="bg-zinc-900 border-zinc-800 font-mono text-xs mt-1.5 h-28"
                placeholder="Entrez le prompt modifié pour le rejeu..."
              />
            </div>
          </TabsContent>

          <TabsContent value="analysis" className="space-y-3 pt-3">
            <div>
              <Label className="text-xs text-zinc-400">Prompt Analysis JSON (Override)</Label>
              <Textarea
                value={injectedAnalysisJson}
                onChange={(e) => setInjectedAnalysisJson(e.target.value)}
                className="bg-zinc-900 border-zinc-800 font-mono text-xs mt-1.5 h-36"
                placeholder="{ ... }"
              />
            </div>
          </TabsContent>

          <TabsContent value="plans" className="space-y-3 pt-3">
            <div>
              <Label className="text-xs text-zinc-400">Plans JSON Array (Override)</Label>
              <Textarea
                value={injectedPlansJson}
                onChange={(e) => setInjectedPlansJson(e.target.value)}
                className="bg-zinc-900 border-zinc-800 font-mono text-xs mt-1.5 h-36"
                placeholder="[ { id: 'P1', ... } ]"
              />
            </div>
          </TabsContent>
        </Tabs>

        <div className="pt-2 flex justify-end">
          <Button
            onClick={handleReplay}
            disabled={replaying}
            className="bg-amber-500 hover:bg-amber-400 text-zinc-950 font-semibold h-9 text-xs"
          >
            {replaying ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-2" />
            )}
            Rejouer la tâche avec les injections
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

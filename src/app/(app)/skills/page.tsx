"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { usePolling, apiPost, apiDelete } from "@/lib/client/hooks";
import { GraduationCap, Plus, Trash2, Sparkles } from "lucide-react";

interface Skill {
  key: string
  name: string
  description: string
  category: string
}

export default function SkillsPage() {
  const { toast } = useToast();
  const { data, loading, reload } = usePolling<{ ok: boolean; builtIn: Skill[]; custom: (Skill & { id: string })[] }>("/api/skills");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [instructions, setInstructions] = useState("");
  const [adding, setAdding] = useState(false);

  async function addSkill() {
    if (name.trim().length < 2 || description.trim().length < 10) {
      toast({ title: "Informations incomplètes", description: "Nom (2+) et description (10+) requis.", variant: "destructive" })
      return
    }
    setAdding(true)
    const res = await apiPost("/api/skills", {
      name: name.trim(),
      description: description.trim(),
      instructions: instructions.trim() || undefined,
    })
    setAdding(false)
    if (!res.ok) {
      toast({ title: "Création impossible", description: res.error, variant: "destructive" })
      return
    }
    toast({ title: "Compétence créée", description: "Réutilisable par vos agents." })
    setName(""); setDescription(""); setInstructions("")
    await reload()
  }

  async function removeSkill(id: string) {
    const res = await apiDelete(`/api/skills/${id}`)
    if (!res.ok) {
      toast({ title: "Suppression impossible", description: res.error, variant: "destructive" })
      return
    }
    await reload()
  }

  const builtIn = data?.builtIn ?? []
  const custom = data?.custom ?? []

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Compétences</h1>
        <p className="text-sm text-zinc-400 mt-1">
          Des savoir-faire réutilisables qui enrichissent les instructions de vos agents.
        </p>
      </div>

      {loading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-32 bg-zinc-800/60" />)}
        </div>
      ) : (
        <>
          <div>
            <h2 className="text-sm font-semibold text-zinc-300 mb-3 flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-emerald-400" /> Compétences intégrées
            </h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {builtIn.map((s) => (
                <Card key={s.key} className="bg-zinc-900/40 border-zinc-800">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="font-medium text-sm text-zinc-100">{s.name}</h3>
                      <Badge variant="outline" className="border-zinc-700 text-zinc-500 text-[10px] shrink-0">{s.category}</Badge>
                    </div>
                    <p className="text-xs text-zinc-400 mt-2 leading-relaxed">{s.description}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          <div>
            <h2 className="text-sm font-semibold text-zinc-300 mb-3 flex items-center gap-2">
              <GraduationCap className="h-4 w-4 text-emerald-400" /> Mes compétences ({custom.length})
            </h2>
            {custom.length > 0 && (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
                {custom.map((s) => (
                  <Card key={s.id} className="bg-zinc-900/40 border-zinc-800">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="font-medium text-sm text-zinc-100">{s.name}</h3>
                        <Button
                          size="sm" variant="ghost"
                          onClick={() => removeSkill(s.id)}
                          className="h-7 text-zinc-500 hover:text-red-400 hover:bg-red-500/10"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                      <p className="text-xs text-zinc-400 mt-2 leading-relaxed">{s.description}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            <Card className="bg-zinc-900/40 border-zinc-800">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2"><Plus className="h-4 w-4 text-emerald-400" />Créer une compétence</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Nom</Label>
                    <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex. Veille concurrentielle" className="bg-zinc-950 border-zinc-800" />
                  </div>
                  <div className="space-y-2">
                    <Label>Description</Label>
                    <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="En une phrase, le savoir-faire" className="bg-zinc-950 border-zinc-800" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Instructions détaillées (injectées aux agents)</Label>
                  <Textarea value={instructions} onChange={(e) => setInstructions(e.target.value)} placeholder="Méthode, étapes, pièges à éviter…" className="min-h-[100px] bg-zinc-950 border-zinc-800 font-mono text-sm" />
                </div>
                <Button onClick={addSkill} disabled={adding} className="bg-emerald-500 text-zinc-950 hover:bg-emerald-400 font-semibold">
                  {adding ? "Création…" : "Créer la compétence"}
                </Button>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  )
}

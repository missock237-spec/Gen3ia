# -*- coding: utf-8 -*-
"""Batch page: add mic dictation to the prompts Textarea (v4.1)."""

path = "src/app/(app)/batch/page.tsx"
with open(path, encoding="utf-8") as f:
    c = f.read()

# 1. Import hook + Mic icon
if "use-dictation" not in c:
    anchor = 'import { Loader2, Layers, PlayCircle, RefreshCw } from "lucide-react";'
    assert anchor in c, "icons anchor"
    c = c.replace(
        anchor,
        'import { Loader2, Layers, PlayCircle, RefreshCw, Mic, MicOff } from "lucide-react";\nimport { useDictation } from "@/components/chat/use-dictation";',
        1,
    )

# 2. Hook wiring in component (after prompts state)
old = '  const [prompts, setPrompts] = useState("")'
assert old in c, "prompts state"
new = old + """
  // v4.1 — dictée vocale : chaque phrase transcrite devient une ligne du lot.
  const dictation = useDictation((text) => {
    setPrompts((p) => (p.trim() ? `${p}\\n${text}` : text))
  })"""
c = c.replace(old, new, 1)

# 3. Mic button next to the counter
old = """        <div className="flex items-center justify-between">
          <span className="text-xs text-zinc-500">"""
new = """        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={dictation.toggle}
            disabled={!dictation.supported}
            className={`flex h-7 w-7 items-center justify-center rounded-full transition-colors disabled:opacity-40 ${
              dictation.listening
                ? "bg-red-500/20 text-red-400 animate-pulse"
                : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
            }`}
            aria-label={dictation.listening ? "Arrêter la dictée" : "Dicter"}
            title={dictation.listening ? "Arrêter la dictée" : "Dicter (micro vocal)"}
          >
            {dictation.transcribing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : dictation.listening ? (
              <MicOff className="h-3.5 w-3.5" />
            ) : (
              <Mic className="h-3.5 w-3.5" />
            )}
          </button>
          <span className="text-xs text-zinc-500">"""
assert old in c, "counter block"
c = c.replace(old, new, 1)

with open(path, "w", encoding="utf-8") as f:
    f.write(c)
print("batch OK")

# -*- coding: utf-8 -*-
"""Task detail: mic dictation on the multimodal generator input (v4.1)."""

path = "src/app/(app)/tasks/[id]/page.tsx"
with open(path, encoding="utf-8") as f:
    c = f.read()

# 1. Import hook + Mic icons
if "use-dictation" not in c:
    anchor = 'import { useI18n } from "@/lib/i18n";'
    assert anchor in c, "i18n anchor"
    c = c.replace(
        anchor,
        'import { useDictation } from "@/components/chat/use-dictation";\n' + anchor,
        1,
    )
    old_icons = "  Network, Send, Download, Bug, SlidersHorizontal, MessageSquare, TerminalSquare, FileCode2,"
    assert old_icons in c, "icons"
    c = c.replace(
        old_icons,
        old_icons + " Mic, MicOff,",
        1,
    )

# 2. Hook (after multimodalPrompt state)
old = '  const [multimodalPrompt, setMultimodalPrompt] = useState("")'
assert old in c, "state"
new = old + """
  // v4.1 — dictée vocale pour le générateur multimédia.
  const mediaDictation = useDictation((text) => {
    setMultimodalPrompt((p) => (p ? `${p} ${text}` : text))
  })"""
c = c.replace(old, new, 1)

# 3. Mic button inside the generator row (before the type buttons)
old = """                <div className="flex gap-2 shrink-0">
                  <Button
                    size="sm"
                    variant={multimodalType === "image" ? "default" : "outline"}"""
new = """                <div className="flex gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={mediaDictation.toggle}
                    disabled={!mediaDictation.supported}
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md border transition-colors disabled:opacity-40 ${
                      mediaDictation.listening
                        ? "border-red-500/40 bg-red-500/10 text-red-400 animate-pulse"
                        : "border-zinc-800 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
                    }`}
                    aria-label={mediaDictation.listening ? "Arrêter la dictée" : "Dicter"}
                    title={mediaDictation.listening ? "Arrêter la dictée" : "Dicter (micro vocal)"}
                  >
                    {mediaDictation.transcribing ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : mediaDictation.listening ? (
                      <MicOff className="h-4 w-4" />
                    ) : (
                      <Mic className="h-4 w-4" />
                    )}
                  </button>
                  <Button
                    size="sm"
                    variant={multimodalType === "image" ? "default" : "outline"}"""
assert old in c, "type buttons"
c = c.replace(old, new, 1)

with open(path, "w", encoding="utf-8") as f:
    f.write(c)
print("multimodal mic OK")

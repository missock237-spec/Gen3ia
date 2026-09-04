# -*- coding: utf-8 -*-
"""Swarm page: replace Textarea+Button with ChatComposer (v4.1)."""

path = "src/app/(app)/swarm/page.tsx"
with open(path, encoding="utf-8") as f:
    c = f.read()

# 1. launch() → payload-based
old = """  async function launch() {
    if (prompt.trim().length < 10) {"""
new = """  async function launch(payload?: { text: string }) {
    const text = payload?.text ?? prompt
    if (text.trim().length < 10) {"""
assert old in c, "launch fn"
c = c.replace(old, new, 1)

old = """        body: JSON.stringify({ prompt, strategy }),"""
new = """        body: JSON.stringify({ prompt: text, strategy }),"""
assert old in c, "launch body"
c = c.replace(old, new, 1)

# 2. Textarea + Button → ChatComposer
old = """        <Textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={4}
          placeholder={t("swarm.promptPlaceholder")}
          className="bg-zinc-950 border-zinc-800"
        />
        <Button onClick={() => void launch()} disabled={running} className="bg-emerald-500 text-zinc-950 hover:bg-emerald-400">
          {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4" />}
          {t("swarm.launch")}
        </Button>"""
new = """        {/* v4.1 — barre de saisie enrichie : micro vocal, envoi, + (connecteurs/fichiers tous types), modèle */}
        <ChatComposer
          value={prompt}
          onChange={setPrompt}
          onSend={async (p) => {
            await launch({ text: p.text })
          }}
          placeholder={t("swarm.promptPlaceholder")}
          minLength={10}
          rows={3}
          sending={running}
          sendLabel={t("swarm.launch")}
        />"""
assert old in c, "textarea block"
c = c.replace(old, new, 1)

# 3. Import
if 'from "@/components/chat/chat-composer"' not in c:
    anchor = 'import { useI18n } from "@/lib/i18n";'
    assert anchor in c, "anchor"
    c = c.replace(anchor, 'import { ChatComposer } from "@/components/chat/chat-composer";\n' + anchor, 1)

with open(path, "w", encoding="utf-8") as f:
    f.write(c)
print("swarm OK")

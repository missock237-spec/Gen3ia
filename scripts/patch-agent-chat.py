# -*- coding: utf-8 -*-
"""Agent test chat: replace Input+Button with ChatComposer (v4.1)."""

path = "src/app/(app)/agents/[id]/page.tsx"
with open(path, encoding="utf-8") as f:
    c = f.read()

# 1. sendTest signature → payload-based
old = """  async function sendTest() {
    if (!agent || !input.trim() || testing) return
    const message = input.trim()
    setInput("")"""
new = """  async function sendTest(payload?: { text: string }) {
    if (!agent || testing) return
    const message = (payload?.text ?? input).trim()
    if (!message) return
    setInput("")"""
assert old in c, "sendTest"
c = c.replace(old, new, 1)

# 2. Input row → ChatComposer
old = """              <div className="mt-4 flex gap-2">
                <Input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault()
                      void sendTest()
                    }
                  }}
                  placeholder={t("agents.test.inputPlaceholder")}
                  className="bg-zinc-950 border-zinc-800 focus-visible:ring-emerald-500/40"
                  disabled={testing}
                />
                <Button onClick={sendTest} disabled={testing || !input.trim()} className="bg-emerald-500 text-zinc-950 hover:bg-emerald-400">
                  {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
              </div>"""
new = """              {/* v4.1 — barre de saisie enrichie : micro vocal, envoi, + (connecteurs/fichiers tous types), modèle */}
              <div className="mt-4">
                <ChatComposer
                  value={input}
                  onChange={setInput}
                  onSend={async (p) => {
                    await sendTest({ text: p.text })
                  }}
                  placeholder={t("agents.test.inputPlaceholder")}
                  disabled={testing}
                  sending={testing}
                  busyPlaceholder={t("agents.test.generating")}
                  rows={1}
                />
              </div>"""
assert old in c, "input row"
c = c.replace(old, new, 1)

# 3. Import ChatComposer
if 'from "@/components/chat/chat-composer"' not in c:
    anchor = 'import { useI18n } from "@/lib/i18n";'
    assert anchor in c, "anchor"
    c = c.replace(anchor, 'import { ChatComposer } from "@/components/chat/chat-composer";\n' + anchor, 1)

with open(path, "w", encoding="utf-8") as f:
    f.write(c)
print("agent chat OK")

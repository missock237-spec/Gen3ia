# -*- coding: utf-8 -*-
"""Live room: replace Input+Button chat bar with ChatComposer (v4.1)."""

path = "src/app/(app)/live/[code]/page.tsx"
with open(path, encoding="utf-8") as f:
    c = f.read()

old = """      <div className={`mt-3 flex gap-2 ${compact ? "border-t border-zinc-800 pt-3" : ""}`}>
        <Input
          value={chatInput}
          onChange={(e) => setChatInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void sendChat()}
          placeholder={
            agentTarget === "agent"
              ? agentActive
                ? t("live.room.placeholder.agentOn")
                : t("live.room.placeholder.agentOff")
              : t("live.room.placeholder.room")
          }
          className="bg-zinc-950 border-zinc-800"
          disabled={ended || (agentTarget === "agent" && agentBusy)}
        />
        <Button
          size="sm"
          variant="outline"
          disabled={ended || (agentTarget === "agent" ? agentBusy : !signalingReady)}
          onClick={() => void sendChat()}
          className={agentTarget === "agent" ? "border-emerald-800 text-emerald-300 hover:bg-emerald-950" : ""}
        >
          {agentTarget === "agent" ? <Sparkles className="h-4 w-4" /> : null}
          {t("live.room.send")}
        </Button>
      </div>"""

new = """      {/* v4.1 — barre de saisie enrichie : micro vocal, envoi, + (connecteurs/fichiers), modèle */}
      <div className={`mt-3 ${compact ? "border-t border-zinc-800 pt-3" : ""}`}>
        <ChatComposer
          value={chatInput}
          onChange={setChatInput}
          onSend={async () => {
            await sendChat()
          }}
          sendLabel={t("live.room.send")}
          placeholder={
            agentTarget === "agent"
              ? agentActive
                ? t("live.room.placeholder.agentOn")
                : t("live.room.placeholder.agentOff")
              : t("live.room.placeholder.room")
          }
          disabled={ended || (agentTarget === "agent" ? agentBusy : !signalingReady)}
          busyPlaceholder={agentTarget === "agent" ? t("live.room.agentAnalyzing") : undefined}
          rows={1}
          showModelSelector={agentTarget === "agent"}
        />
      </div>"""

assert old in c, "chat input block"
c = c.replace(old, new, 1)

# Import ChatComposer (idempotent)
if 'from "@/components/chat/chat-composer"' not in c:
    anchor = 'import { useI18n } from "@/lib/i18n";'
    assert anchor in c, "anchor import"
    c = c.replace(anchor, 'import { ChatComposer } from "@/components/chat/chat-composer";\n' + anchor, 1)

with open(path, "w", encoding="utf-8") as f:
    f.write(c)
print("live chat OK")

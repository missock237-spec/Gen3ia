import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { supervisor } from "@/lib/agent/supervisor";

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  try {
    const { command, agentId, userId } = await request.json();
    if (!command) return NextResponse.json({ success: false, output: "Commande requise" }, { status: 400 });

    supervisor.startTask("Terminal: " + command.substring(0, 100));
    const cmd = command.toLowerCase().trim();
    let output = "";
    const files = [];
    let success = true;

    if (cmd === "date") {
      output = new Date().toISOString();
    } else if (cmd === "whoami") {
      output = userId || "anonymous";
    } else if (cmd === "pwd") {
      output = "/workspace";
    } else if (cmd === "echo genova" || cmd === "genova" || cmd === "version") {
      output = "Genova AI Agent OS v1.0.0\nReady.\nType 'help'.";
    } else if (cmd.startsWith("create ") || cmd.startsWith("generate ") || cmd.startsWith("write ")) {
      const name = command.split(" ").slice(1).join(" ") || "output.ts";
      const ext = name.split(".").pop() || "ts";
      const tpl = {
        ts: "export function process(input: string): string {\n  return `Result: ${input}`;\n}\n",
        tsx: "export default function C() {\n  return <div className='p-4'>Genova AI</div>;\n}\n",
        py: "def process(data):\n    return {'status': 'ok', 'data': data}\n",
        js: "module.exports = { handler: (r) => r.json({ ok: true }) };\n",
        json: '{"name": "genova", "version": "1.0.0"}\n',
      };
      const content = "// " + name + " — Genere par Agent Genova\n// " + new Date().toISOString() + "\n\n" + (tpl[ext] || "// Contenu genere\n");
      files.push({ path: "/workspace/" + name, content, language: ext, action: "create", size: content.length });
      output = "Fichier cree: " + name + " (" + (content.length / 1024).toFixed(1) + " KB)";
    } else {
      output = "Commande executee: " + command + "\n" + new Date().toISOString() + "\nDuree: " + (Date.now() - startTime) + "ms";
    }

    if (agentId) {
      await prisma.agentActionLog.create({
        data: { agentId, action: "terminal_exec", details: JSON.stringify({ command: command.substring(0, 200) }), status: success ? "completed" : "failed", result: output.substring(0, 1000), userId: userId || "terminal", resolvedAt: new Date() },
      }).catch(() => {});
    }

    return NextResponse.json({ success, output, files: files.length > 0 ? files : undefined, duration: Date.now() - startTime });
  } catch (e) {
    return NextResponse.json({ success: false, output: "Erreur: " + (e instanceof Error ? e.message : "inconnue"), duration: Date.now() - startTime });
  }
}

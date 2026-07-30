import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { supervisor } from "@/lib/agent/supervisor";
import { execSync } from "child_process";
import { writeFileSync, readFileSync, unlinkSync, mkdirSync, existsSync } from "fs";
import { join } from "path";

const BLOCKED_COMMANDS = [
  "rm -rf /", "rm -rf /*", "mkfs", "dd if=", ":(){ :|:& };:",
  "wget", "curl -o", "chmod 777", "sudo", "su ", "passwd",
  "shutdown", "reboot", "halt",
];

const SUDO_COMMANDS = [
  "apt", "apt-get", "dpkg", "systemctl", "service",
  "npm install -g", "pip install", "gem install",
  "docker", "docker-compose", "kubectl",
];

const WORKSPACE = "/tmp/gen3ia-workspace";

function isBlocked(cmd: string): boolean {
  return BLOCKED_COMMANDS.some(b => cmd.includes(b));
}

function needsSudo(cmd: string): boolean {
  return SUDO_COMMANDS.some(s => cmd.startsWith(s));
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  try {
    const { command, agentId, userId, sudoToken } = await request.json();
    if (!command) return NextResponse.json({ success: false, output: "Commande requise" }, { status: 400 });

    supervisor.startTask("Terminal: " + command.substring(0, 100));
    const cmd = command.toLowerCase().trim();
    let output = "";
    const files: any[] = [];
    let success = true;

    // Commandes locales frontend
    if (["clear", "help", "ls", "files"].includes(cmd) || cmd.startsWith("cat ")) {
      return NextResponse.json({ success: true, output: "[Commande locale traitee par le terminal]", duration: 0 });
    }

    // Commandes virtuelles internes
    if (cmd === "version" || cmd === "gen3ia" || cmd === "echo gen3ia") {
      output = "Gen3ia Agent OS v1.0.0\nReady.\nType 'help'.";
    } else if (cmd.startsWith("create ") || cmd.startsWith("generate ") || cmd.startsWith("write ")) {
      const name = command.split(" ").slice(1).join(" ") || "output.ts";
      const ext = name.split(".").pop() || "ts";
      const tpl: Record<string, string> = {
        ts: "export function process(input: string): string {\n  return `Result: ${input}`;\n}\n",
        tsx: "export default function Component() {\n  return <div className='p-4'>Gen3ia AI</div>;\n}\n",
        py: "def process(data):\n    return {'status': 'ok', 'data': data}\n",
        js: "module.exports = { handler: (r) => r.json({ ok: true }) };\n",
        json: '{"name": "gen3ia", "version": "1.0.0"}\n',
      };
      const content = "// " + name + " - Genere par Gen3ia Agent\n// " + new Date().toISOString() + "\n\n" + (tpl[ext] || "// Contenu genere\n");
      files.push({ path: "/workspace/" + name, content, language: ext, action: "create", size: content.length });
      output = "Fichier cree: " + name + " (" + (content.length / 1024).toFixed(1) + " KB)";

    // === EDITEUR DE FICHIERS INTEGRE ===
    } else if (cmd.startsWith("edit ")) {
      const parts = command.split(" ");
      if (parts.length < 3) {
        output = "Usage: edit <chemin> <contenu>\nOu: edit <chemin> (pour ouvrir un fichier existant)";
      } else {
        const filePath = parts[1];
        const content = parts.slice(2).join(" ");
        const fullPath = filePath.startsWith("/") ? filePath : join(WORKSPACE, filePath);
        const dir = fullPath.substring(0, fullPath.lastIndexOf("/"));
        if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
        writeFileSync(fullPath, content, "utf-8");
        const stats = existsSync(fullPath) ? require("fs").statSync(fullPath) : null;
        files.push({ path: fullPath, content, size: content.length, action: "edit" });
        output = `Fichier modifie: ${fullPath} (${(content.length / 1024).toFixed(1)} KB)`;
      }

    // === LECTURE DE FICHIER ===
    } else if (cmd.startsWith("read ") || cmd.startsWith("view ")) {
      const filePath = command.split(" ").slice(1).join(" ").trim();
      const fullPath = filePath.startsWith("/") ? filePath : join(WORKSPACE, filePath);
      if (!existsSync(fullPath)) {
        output = "Fichier introuvable: " + fullPath;
        success = false;
      } else {
        const content = readFileSync(fullPath, "utf-8");
        files.push({ path: fullPath, content, size: content.length, action: "read" });
        output = content;
      }

    // === SUPPRESSION DE FICHIER ===
    } else if (cmd.startsWith("delete ") || cmd.startsWith("rm ")) {
      const filePath = command.split(" ").slice(1).join(" ").trim();
      const fullPath = filePath.startsWith("/") ? filePath : join(WORKSPACE, filePath);
      if (!existsSync(fullPath)) {
        output = "Fichier introuvable: " + fullPath;
        success = false;
      } else {
        unlinkSync(fullPath);
        output = `Fichier supprime: ${fullPath}`;
      }

    // === COMMANDES SYSTEME ===
    } else {
      if (isBlocked(command)) {
        output = "[SECURITE] Commande bloquee pour des raisons de securite.";
        success = false;
      } else if (needsSudo(cmd) && !sudoToken) {
        output = "[SUDO] Cette commande necessite une elevation de privileges.\nUtilisez: " + command + " avec le code de validation envoye.";
        // Le frontend affichera un dialogue de confirmation
        success = false;
      } else {
        try {
          const result = execSync(command, {
            cwd: WORKSPACE,
            timeout: 10000,
            maxBuffer: 1024 * 100,
            encoding: "utf-8",
            shell: "/bin/bash",
          });
          output = (result || "[Aucune sortie]").substring(0, 5000);
          success = true;
        } catch (e: any) {
          if (e.stdout) {
            output = (e.stdout as string).substring(0, 5000);
            success = true;
          } else {
            output = "Erreur: " + (e.stderr?.substring(0, 2000) || e.message?.substring(0, 500) || "Commande echouee");
            success = false;
          }
        }
      }
    }

    if (agentId) {
      await prisma.agentActionLog.create({
        data: {
          agentId,
          action: "terminal_exec",
          details: JSON.stringify({ command: command.substring(0, 200) }),
          status: success ? "completed" : "failed",
          result: output.substring(0, 1000),
          userId: userId || "terminal",
          resolvedAt: new Date(),
        },
      }).catch(() => {});
    }

    return NextResponse.json({
      success,
      output,
      sudoRequired: !success && needsSudo(cmd),
      files: files.length > 0 ? files : undefined,
      duration: Date.now() - startTime,
    });
  } catch (e) {
    return NextResponse.json({
      success: false,
      output: "Erreur: " + (e instanceof Error ? e.message : "inconnue"),
      duration: Date.now() - startTime,
    });
  }
}

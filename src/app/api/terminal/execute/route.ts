import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth.config";
import { writeFileSync, readFileSync, unlinkSync, mkdirSync, existsSync } from "fs";
import { join } from "path";

const WORKSPACE = "/tmp/gen3ia-workspace";

// Liste blanche de commandes autorisees (securite stricte)
const ALLOWED_COMMANDS = new Set([
  "clear", "help", "ls", "files", "version", "gen3ia",
  "create", "generate", "write", "edit", "read", "view", "delete", "rm",
  "echo", "cat", "head", "tail", "wc", "grep", "sort", "find",
  "pwd", "date", "whoami", "id", "uname", "env",
]);

// Commandes virtuelles gerees par le terminal (pas d'execution systeme)
const VIRTUAL_COMMANDS = new Set([
  "clear", "help", "ls", "files", "version", "gen3ia",
  "create", "generate", "write", "edit", "read", "view", "delete", "rm",
]);

function isAllowedCommand(cmd: string): boolean {
  const baseCmd = cmd.split(" ")[0]?.toLowerCase() || "";
  return ALLOWED_COMMANDS.has(baseCmd);
}

function sanitizePath(filePath: string): string {
  const fullPath = filePath.startsWith("/") ? filePath : join(WORKSPACE, filePath);
  // Empecher les traversees de repertoire hors du workspace
  if (!fullPath.startsWith(WORKSPACE) && !fullPath.startsWith("/tmp/gen3ia")) {
    return join(WORKSPACE, "..", "..", "restricted");
  }
  return fullPath;
}

const TEMPLATES: Record<string, string> = {
  ts: "export function process(input: string): string {\n  return `Result: ${input}`;\n}\n",
  tsx: "export default function Component() {\n  return <div className='p-4'>Gen3ia AI</div>;\n}\n",
  py: "def process(data):\n    return {'status': 'ok', 'data': data}\n",
  js: "module.exports = { handler: (r) => r.json({ ok: true }) };\n",
  json: '{"name": "gen3ia", "version": "1.0.0"}\n',
};

export async function POST(request: NextRequest) {
  const startTime = Date.now();

  // 1. AUTHENTIFICATION OBLIGATOIRE
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ success: false, output: "Non authentifie. Connectez-vous d'abord." }, { status: 401 });
  }

  // 2. VERIFICATION DU ROLE (admin uniquement)
  const userRole = (session.user as any).role;
  if (userRole !== "admin" && userRole !== "developer") {
    return NextResponse.json({ success: false, output: "Acces refuse. Droits administrateur requis." }, { status: 403 });
  }

  try {
    const { command, agentId } = await request.json();
    if (!command || typeof command !== "string") {
      return NextResponse.json({ success: false, output: "Commande requise" }, { status: 400 });
    }

    const trimmed = command.trim();
    const lower = trimmed.toLowerCase();
    const baseCmd = lower.split(" ")[0] || "";

    // 3. VERIFICATION COMMANDE AUTORISEE
    if (!isAllowedCommand(lower)) {
      return NextResponse.json({
        success: false,
        output: `Commande non autorisee: "${baseCmd}".\nCommandes autorisees: ${[...ALLOWED_COMMANDS].join(", ")}`,
      }, { status: 403 });
    }

    let output = "";
    const files: any[] = [];
    let success = true;

    // 4. COMMANDES VIRTUELLES (pas de execSync)
    if (VIRTUAL_COMMANDS.has(baseCmd)) {
      if (lower === "clear" || lower === "help") {
        output = "Gen3ia Terminal v1.0\nCommandes: create, edit, read, delete, ls, echo, cat, head, tail, grep, find, pwd, date, whoami, uname, env";
      } else if (lower === "version" || lower === "gen3ia") {
        output = "Gen3ia Agent OS v1.0.0\nReady.";
      } else if (lower.startsWith("create ") || lower.startsWith("generate ") || lower.startsWith("write ")) {
        const name = trimmed.split(" ").slice(1).join(" ") || "output.ts";
        const ext = name.split(".").pop() || "ts";
        const content = "// " + name + " - Genere par Gen3ia\n\n" + (TEMPLATES[ext] || "// Contenu genere\n");
        files.push({ path: "/workspace/" + name, content, language: ext, action: "create", size: content.length });
        output = "Fichier cree: " + name + " (" + (content.length / 1024).toFixed(1) + " KB)";
      } else if (lower.startsWith("edit ")) {
        const parts = trimmed.split(" ");
        if (parts.length < 3) {
          output = "Usage: edit <chemin> <contenu>";
        } else {
          const filePath = sanitizePath(parts[1]);
          const content = parts.slice(2).join(" ");
          const dir = filePath.substring(0, filePath.lastIndexOf("/"));
          if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
          writeFileSync(filePath, content, "utf-8");
          files.push({ path: filePath, content, size: content.length, action: "edit" });
          output = `Fichier modifie: ${filePath} (${(content.length / 1024).toFixed(1)} KB)`;
        }
      } else if (lower.startsWith("read ") || lower.startsWith("view ")) {
        const filePath = sanitizePath(trimmed.split(" ").slice(1).join(" ").trim());
        if (!existsSync(filePath)) {
          output = "Fichier introuvable: " + filePath; success = false;
        } else {
          const content = readFileSync(filePath, "utf-8");
          files.push({ path: filePath, content, size: content.length, action: "read" });
          output = content;
        }
      } else if (lower.startsWith("delete ") || lower.startsWith("rm ")) {
        const filePath = sanitizePath(trimmed.split(" ").slice(1).join(" ").trim());
        if (!existsSync(filePath)) {
          output = "Fichier introuvable: " + filePath; success = false;
        } else {
          unlinkSync(filePath);
          output = `Fichier supprime: ${filePath}`;
        }
      }
    } else {
      // 5. COMMANDES LECTURE SEULE (safe - pas de execSync)
      try {
        const { execSync } = require("child_process");
        const result = execSync(trimmed, {
          cwd: WORKSPACE,
          timeout: 5000,
          maxBuffer: 1024 * 50,
          encoding: "utf-8",
          shell: "/bin/bash",
        });
        output = (result || "[Aucune sortie]").substring(0, 5000);
        success = true;
      } catch (e: any) {
        if (e.stdout) {
          output = (e.stdout as string).substring(0, 5000); success = true;
        } else {
          output = "Erreur: " + (e.stderr?.substring(0, 2000) || e.message?.substring(0, 500) || "Commande echouee");
          success = false;
        }
      }
    }

    return NextResponse.json({ success, output, files: files.length > 0 ? files : undefined, duration: Date.now() - startTime });
  } catch (e) {
    return NextResponse.json({ success: false, output: "Erreur: " + (e instanceof Error ? e.message : "inconnue"), duration: Date.now() - startTime });
  }
}

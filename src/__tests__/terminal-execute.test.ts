// ============================================================
// Tests unitaires — Terminal API (exécution réelle)
// ============================================================
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    agentActionLog: { create: vi.fn() },
  },
}));

vi.mock("@/lib/agent/supervisor", () => ({
  supervisor: { startTask: vi.fn() },
}));

vi.mock("child_process", () => ({
  execSync: vi.fn(),
}));

import { execSync } from "child_process";

describe("POST /api/terminal/execute", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejette si commande manquante", async () => {
    const { POST } = await import("@/app/api/terminal/execute/route");
    const req = new Request("http://localhost/api/terminal/execute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const res = await POST(req as any);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.success).toBe(false);
  });

  it("execute une commande systeme via execSync", async () => {
    (execSync as any).mockReturnValue("hello world\n");

    const { POST } = await import("@/app/api/terminal/execute/route");
    const req = new Request("http://localhost/api/terminal/execute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ command: "echo hello", userId: "test-user" }),
    });
    const res = await POST(req as any);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.output).toBe("hello world\n");
  });

  it("execute la commande avec timeout de 10s", async () => {
    (execSync as any).mockReturnValue("ok\n");

    const { POST } = await import("@/app/api/terminal/execute/route");
    const req = new Request("http://localhost/api/terminal/execute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ command: "ls" }),
    });
    const res = await POST(req as any);
    expect(execSync).toHaveBeenCalledWith(
      "ls",
      expect.objectContaining({ timeout: 10000 })
    );
  });

  it("execute dans /tmp", async () => {
    (execSync as any).mockReturnValue("");

    const { POST } = await import("@/app/api/terminal/execute/route");
    const req = new Request("http://localhost/api/terminal/execute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ command: "pwd" }),
    });
    await POST(req as any);
    expect(execSync).toHaveBeenCalledWith(
      "pwd",
      expect.objectContaining({ cwd: "/tmp" })
    );
  });

  it("bloque les commandes dangereuses", async () => {
    const { POST } = await import("@/app/api/terminal/execute/route");
    const req = new Request("http://localhost/api/terminal/execute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ command: "rm -rf /" }),
    });
    const res = await POST(req as any);
    const data = await res.json();
    expect(data.success).toBe(false);
    expect(data.output).toContain("bloquee");
    expect(execSync).not.toHaveBeenCalled();
  });

  it("bloque les commandes sudo", async () => {
    const { POST } = await import("@/app/api/terminal/execute/route");
    const req = new Request("http://localhost/api/terminal/execute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ command: "sudo rm -rf /tmp" }),
    });
    const res = await POST(req as any);
    const data = await res.json();
    expect(data.success).toBe(false);
    expect(execSync).not.toHaveBeenCalled();
  });

  it("retourne la sortie standard meme en cas d'erreur", async () => {
    const err = new Error("Command failed");
    (err as any).stdout = "partial output\n";
    (err as any).stderr = "";
    (execSync as any).mockImplementation(() => { throw err; });

    const { POST } = await import("@/app/api/terminal/execute/route");
    const req = new Request("http://localhost/api/terminal/execute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ command: "ls /nonexistent" }),
    });
    const res = await POST(req as any);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.output).toBe("partial output\n");
  });

  it("retourne une erreur si stderr et pas de stdout", async () => {
    const err = new Error("Command failed: not found");
    (err as any).stdout = "";
    (err as any).stderr = "bash: unknown: command not found\n";
    (execSync as any).mockImplementation(() => { throw err; });

    const { POST } = await import("@/app/api/terminal/execute/route");
    const req = new Request("http://localhost/api/terminal/execute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ command: "unknown" }),
    });
    const res = await POST(req as any);
    const data = await res.json();
    expect(data.success).toBe(false);
    expect(data.output).toContain("not found");
  });

  it("cree des fichiers avec la commande create", async () => {
    const { POST } = await import("@/app/api/terminal/execute/route");
    const req = new Request("http://localhost/api/terminal/execute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ command: "create app.ts", agentId: "agent_1", userId: "user_1" }),
    });
    const res = await POST(req as any);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.files).toBeDefined();
    expect(data.files?.length).toBe(1);
    expect(data.files?.[0]?.path).toContain("app.ts");
    expect(execSync).not.toHaveBeenCalled();
  });

  it("renvoie la version Gen3ia", async () => {
    const { POST } = await import("@/app/api/terminal/execute/route");
    const req = new Request("http://localhost/api/terminal/execute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ command: "version" }),
    });
    const res = await POST(req as any);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.output).toContain("Gen3ia");
  });

  it("logge l'execution dans agentActionLog si agentId fourni", async () => {
    const { prisma } = await import("@/lib/db");
    (execSync as any).mockReturnValue("output");

    const { POST } = await import("@/app/api/terminal/execute/route");
    const req = new Request("http://localhost/api/terminal/execute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ command: "echo test", agentId: "agent_1", userId: "user_1" }),
    });
    await POST(req as any);

    expect(prisma.agentActionLog.create).toHaveBeenCalled();
  });
});

import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const endpoint = pathname.replace("/api/", "");

  const handlers: Record<string, () => any> = {
    "dashboard": () => ({ message: "Dashboard data", metrics: { agents: 0, tasks: 0, active: 0 } }),
    "analytics": () => ({ message: "Analytics data", events: [], period: "today" }),
    "agents": () => ({ message: "Agents list", agents: [] }),
    "billing": () => ({ message: "Billing info", plan: "free", usage: {} }),
    "activities": () => ({ message: "Activities log", activities: [] }),
    "integrations": () => ({ message: "Integrations", integrations: [] }),
    "connectors": () => ({ message: "Connectors", connectors: [] }),
    "conversations": () => ({ message: "Conversations", conversations: [] }),
    "workflows": () => ({ message: "Workflows", workflows: [] }),
    "tasks": () => ({ message: "Tasks", tasks: [] }),
    "memory": () => ({ message: "Memory store", memories: [] }),
    "knowledge": () => ({ message: "Knowledge base", documents: [] }),
    "rag": () => ({ message: "RAG system", collections: [] }),
    "marketplace": () => ({ message: "Marketplace", items: [] }),
    "scheduler": () => ({ message: "Scheduler", jobs: [] }),
    "monitoring": () => ({ message: "Monitoring", status: "healthy", uptime: "99.9%" }),
    "queue": () => ({ message: "Queue", queues: [] }),
    "resources": () => ({ message: "Resources", usage: {} }),
    "services": () => ({ message: "Services", services: [] }),
    "system": () => ({ message: "System info", version: "0.3.0", node: process.version }),
    "admin": () => ({ message: "Admin panel", users: 0 }),
    "social": () => ({ message: "Social media", posts: [] }),
    "whatsapp": () => ({ message: "WhatsApp API", connected: false, status: "disconnected" }),
    "voice": () => ({ message: "Voice services", enabled: true }),
    "multimodal": () => ({ message: "Multimodal AI", models: [] }),
    "browser": () => ({ message: "Browser automation", sessions: [] }),
    "images": () => ({ message: "Image generation", models: [] }),
    "videos": () => ({ message: "Video generation", models: [] }),
    "ai": () => ({ message: "AI services", providers: ["openai", "anthropic", "groq"] }),
    "ai-server": () => ({ message: "AI Server", status: "ready", gpu: false }),
    "multi-agent": () => ({ message: "Multi-Agent system", agents: [], orchestrator: "idle" }),
    "observability": () => ({ message: "Observability", traces: [], metrics: {} }),
    "pocketbase": () => ({ message: "PocketBase", connected: false }),
    "n8n": () => ({ message: "n8n workflows", connected: false }),
    "fluro": () => ({ message: "Fluro API" }),
    "approvals": () => ({ message: "Approvals", pending: [] }),
    "avatars": () => ({ message: "Avatars", avatars: [] }),
    "guardrails": () => ({ message: "Guardrails", rules: [] }),
    "workspaces": () => ({ message: "Workspaces", workspaces: [] }),
  };

  const key = endpoint.replace(/\/$/, "");
  const handler = handlers[key];

  if (handler) {
    return NextResponse.json(handler());
  }

  if (key.startsWith("auth/")) {
    return NextResponse.json({ message: "Auth endpoint", endpoint: key });
  }

  return NextResponse.json({ error: "Endpoint not found", endpoint: key }, { status: 404 });
}

export async function POST(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const endpoint = pathname.replace("/api/", "");

  return NextResponse.json({ message: `POST ${endpoint} received`, success: true });
}

export async function PUT(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const endpoint = pathname.replace("/api/", "");

  return NextResponse.json({ message: `PUT ${endpoint} received`, success: true });
}

export async function DELETE(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const endpoint = pathname.replace("/api/", "");

  return NextResponse.json({ message: `DELETE ${endpoint} received`, success: true });
}

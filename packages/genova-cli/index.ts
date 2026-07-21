#!/usr/bin/env bun
// ============================================================
// GENOVA CLI — Command Line Interface
// ============================================================
// Commands: deploy, test, logs, agent, config
// ============================================================

const API_BASE = process.env.GENOVA_API_URL ?? "http://localhost:3000/api";
const API_KEY = process.env.GENOVA_API_KEY ?? "";

async function request(method: string, path: string, body?: unknown) {
  const r = await fetch(`${API_BASE}${path}`, {
    method,
    headers: { "Content-Type": "application/json", "x-api-key": API_KEY },
    body: body ? JSON.stringify(body) : undefined,
  });
  return r.json();
}

async function main() {
  const cmd = process.argv[2];
  const sub = process.argv[3];

  switch (cmd) {
    case "agent":
      if (sub === "list") {
        const agents = await request("GET", "/agents");
        console.table(agents);
      } else if (sub === "run" && process.argv[4]) {
        const result = await request("POST", "/agents/run", { agentId: process.argv[4], input: process.argv[5] ?? "Hello" });
        console.log("Result:", result.output ?? JSON.stringify(result));
      }
      break;

    case "deploy":
      console.log("Deploying Genova...");
      const build = await request("POST", "/admin/deploy", {});
      console.log("Deploy result:", build);
      break;

    case "test":
      console.log("Running tests...");
      const health = await request("GET", "/health");
      console.log("Health:", health.status === "healthy" ? "OK" : "FAIL");
      break;

    case "logs":
      console.log("Fetching logs... (implement with /admin/logs)");
      break;

    case "help":
    default:
      console.log(`
Genova CLI — Usage:
  genova agent list              Lister les agents
  genova agent run <id> [input]  Executer un agent
  genova deploy                  Deployer l'application
  genova test                    Tester la connexion
  genova logs                    Voir les logs
  genova help                    Cette aide
      `);
  }
}

main().catch(console.error);
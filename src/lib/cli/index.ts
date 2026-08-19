const API_BASE = process.env.GENOVA_API_URL || "http://localhost:3000";

const commands = {
  help: { desc: "Affiche l aide", handler: () => printHelp() },
  "agent:create": { desc: "Cree un agent --name <n> --type <t>", handler: async (args) => {
    const name = args[args.indexOf("--name") + 1] || "agent";
    const type = args[args.indexOf("--type") + 1] || "assistant";
    const r = await fetch(API_BASE + "/api/agents", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, type, description: "CLI agent", userId: process.env.GENOVA_USER || "cli" }) });
    const d = await r.json();
    console.log(r.ok ? "Agent cree: " + d.id : "Erreur: " + d.error);
  }},
  "model:list": { desc: "Liste les modeles", handler: async () => {
    const r = await fetch(API_BASE + "/api/cost-engine/models");
    const d = await r.json();
    if (d.models) d.models.forEach(m => console.log(m.id.padEnd(20) + m.provider.padEnd(12) + "$" + m.costPer1kTokens.toFixed(4) + "/1k tokens"));
  }},
  health: { desc: "Health check", handler: async () => {
    const r = await fetch(API_BASE + "/api/health");
    const d = await r.json();
    console.log("Status: " + d.status);
  }},
};

function printHelp() {
  console.log("Genova CLI v1.0");
  console.log("Usage: npx tsx " + __filename + " <cmd>");
  console.log("");
  Object.entries(commands).forEach(([name, cmd]) => console.log("  " + name.padEnd(20) + cmd.desc));
}

const cmd = process.argv[2];
if (cmd && commands[cmd]) commands[cmd].handler(process.argv.slice(3));
else printHelp();

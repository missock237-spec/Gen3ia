// ============================================================
// PING — Healthcheck pour monitoring
// ============================================================

export async function ping(): Promise<{ status: string; timestamp: string; uptime: number }> {
  return {
    status: "ok",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  };
}
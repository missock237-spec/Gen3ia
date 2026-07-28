// ============================================================
// GEN3IA SDK — Client TypeScript pour integrateurs tiers
// ============================================================
// API complete : agents, workflows, images, videos, audio,
// WhatsApp, paiements, supervision
// ============================================================

const GEN3IA_API_BASE = process.env.GEN3IA_API_URL ?? "https://gen3ia.ai/api";

interface SDKConfig {
  apiKey: string;
  baseUrl?: string;
}

class Gen3iaClient {
  private apiKey: string;
  private baseUrl: string;

  constructor(config: SDKConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl ?? GEN3IA_API_BASE;
  }

  private headers() {
    return { "Content-Type": "application/json", "x-api-key": this.apiKey };
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: this.headers(),
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Gen3ia API error (${response.status}): ${error.slice(0, 200)}`);
    }
    return response.json() as Promise<T>;
  }

  async createAgent(config: { name: string; type: string; description?: string; systemPrompt?: string; model?: string; temperature?: number }) {
    return this.request("POST", "/api/agents", config);
  }

  async listAgents(page = 1, limit = 20) {
    return this.request("GET", `/api/agents?page=${page}&limit=${limit}`);
  }

  async executeAgent(agentId: string, input: string, sessionId?: string) {
    return this.request("POST", "/api/agents/run", { agentId, input, sessionId });
  }

  async createWorkflow(config: { name: string; steps: Array<{ agentId: string; input: string }> }) {
    return this.request("POST", "/api/workflows", config);
  }

  async executeWorkflow(workflowId: string) {
    return this.request("POST", `/api/workflows/${workflowId}/execute`, {});
  }

  async generateImage(params: { prompt: string; model?: string; width?: number; height?: number }) {
    return this.request("POST", "/api/images/generate", params);
  }

  async generateVideo(params: { prompt: string; model?: string; numFrames?: number }) {
    return this.request("POST", "/api/videos/generate", params);
  }

  async generateAudio(params: { text: string; model?: string; speed?: number }) {
    return this.request("POST", "/api/audio/generate", params);
  }

  async sendWhatsAppMessage(params: { to: string; text: string }) {
    return this.request("POST", "/api/whatsapp/send", { type: "text", ...params });
  }

  async sendWhatsAppMedia(params: { to: string; type: "image" | "video" | "audio" | "document"; mediaUrl: string; caption?: string }) {
    return this.request("POST", "/api/whatsapp/send", params);
  }

  async getSubscriptionPlans() {
    return this.request("GET", "/api/payments/plans", undefined);
  }

  async subscribe(params: { planId: string; phone: string; operator: string }) {
    return this.request("POST", "/api/payments/subscribe", params);
  }

  async getSupervisionDashboard() {
    return this.request("GET", "/api/admin/supervision", undefined);
  }

  async getHealth() {
    return this.request("GET", "/api/health", undefined);
  }
}

export { Gen3iaClient };
export default Gen3iaClient;

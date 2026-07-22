export const HF_API_BASE = "https://api-inference.huggingface.co/models";

export function getHeaders(): Record<string, string> {
  const token = process.env.HUGGINGFACE_API_KEY ?? process.env.HF_TOKEN ?? "";
  if (!token) return { "Content-Type": "application/json" };
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

export async function queryHF(modelId: string, payload: Record<string, unknown>): Promise<Response> {
  return fetch(`${HF_API_BASE}/${modelId}`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(120_000),
  });
}

export async function bufferToBase64(buffer: ArrayBuffer): Promise<string> {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary);
}
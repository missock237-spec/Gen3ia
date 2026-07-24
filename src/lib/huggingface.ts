const HF_API_URL = 'https://api-inference.huggingface.co/models';
function getApiKey(): string {
  return process.env.HUGGINGFACE_API_KEY || process.env.NEXT_PUBLIC_HUGGINGFACE_API_KEY || '';
}
export async function queryHF(modelPath: string, payload: unknown): Promise<Response> {
  const apiKey = getApiKey();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;
  return fetch(`${HF_API_URL}/${modelPath}`, {
    method: 'POST', headers, body: JSON.stringify(payload),
    signal: AbortSignal.timeout(120000),
  });
}
export async function bufferToBase64(buffer: ArrayBuffer): Promise<string> {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  if (typeof btoa !== 'undefined') return btoa(binary);
  return Buffer.from(binary, 'binary').toString('base64');
}

/* Extraction d'identité pour le rate limiting. */

export interface Identity {
  key: string;
  apiKey?: string;
  bypass: boolean;
}

export function getApiKey(headers: Headers): string | undefined {
  return (
    headers.get("x-api-key") ??
    headers.get("authorization")?.replace(/^Bearer /i, "")
  )?.trim() || undefined;
}

export function getClientIp(headers: Headers): string {
  const fwd = headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return headers.get("x-real-ip") ?? "unknown";
}

export function resolveIdentity(headers: Headers, userId?: string): Identity {
  const apiKey = getApiKey(headers);
  const ip = getClientIp(headers);
  return {
    key: apiKey ? `apikey:${apiKey}` : userId ? `user:${userId}` : `ip:${ip}`,
    apiKey,
    bypass: Boolean(apiKey),
  };
}

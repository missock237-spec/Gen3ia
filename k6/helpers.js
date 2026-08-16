const BASE_URL = __ENV.BASE_URL || "http://localhost:3000";

export function baseHeaders(apiKey) {
  const h = { "content-type": "application/json" };
  if (apiKey) h["x-api-key"] = apiKey;
  return h;
}

export const baseUrl = BASE_URL;

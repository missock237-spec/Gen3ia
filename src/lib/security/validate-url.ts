/**
 * Validates that a URL is safe from SSRF attacks.
 * Blocks localhost, private IPs, and requires HTTPS.
 */
export function validateUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    // Must be HTTPS
    if (parsed.protocol !== 'https:') return false;
    // Block localhost
    const hostname = parsed.hostname.toLowerCase();
    if (hostname === 'localhost' || hostname === '0.0.0.0') return false;
    // Block private IP ranges
    if (/^(127\.|10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.|169\.254\.)/.test(hostname)) return false;
    // Block IPv6 loopback
    if (hostname === '::1' || hostname === '[::1]') return false;
    return true;
  } catch {
    return false;
  }
}

/** Validates that a path segment is safe (alphanumeric + dashes only) */
export function validatePathSegment(segment: string): boolean {
  return /^[a-zA-Z0-9_-]+$/.test(segment);
}

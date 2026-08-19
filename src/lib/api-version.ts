// ============================================================
// Gen3ia — API Versioning Utilities
// ============================================================
// Edge-safe utilities for extracting, validating, and managing
// API versions and deprecation metadata (RFC 8594 Sunset header).
// ============================================================

/** Current default and supported API versions */
export const CURRENT_API_VERSION = 'v1';
export const DEFAULT_API_VERSION = 'v1';
export const SUPPORTED_API_VERSIONS: readonly string[] = ['v1'];

/** Version configuration & metadata */
export interface ApiVersionConfig {
  version: string;
  status: 'current' | 'supported' | 'deprecated';
  deprecationDate?: string; // ISO 8601 string, e.g. "2026-01-01T00:00:00Z"
  sunsetDate?: string;      // ISO 8601 string, e.g. "2027-01-01T00:00:00Z"
  notes?: string;
}

/** Registry of API version metadata */
export const API_VERSION_CONFIGS: Record<string, ApiVersionConfig> = {
  v1: {
    version: 'v1',
    status: 'current',
    notes: 'Initial stable version of Gen3ia API',
  },
};

/**
 * Extracts API version from request URL path (/api/v1/...) or X-API-Version header.
 * Defaults to DEFAULT_API_VERSION ('v1') if unversioned.
 */
export function getApiVersion(request: Request): string {
  try {
    const url = new URL(request.url, 'http://localhost');
    const pathMatch = url.pathname.match(/^\/api\/(v\d+(?:\.\d+)?)(?:\/|$)/i);
    if (pathMatch && pathMatch[1]) {
      return pathMatch[1].toLowerCase();
    }
  } catch {
    // Ignore URL parsing errors and fallback to header / default
  }

  const headerVersion =
    request.headers.get('x-api-version') ||
    request.headers.get('X-API-Version');

  if (headerVersion && headerVersion.trim() !== '') {
    return headerVersion.trim().toLowerCase();
  }

  return DEFAULT_API_VERSION;
}

/**
 * Checks if a given version string is supported.
 */
export function isVersionSupported(version: string): boolean {
  if (!version) return false;
  return SUPPORTED_API_VERSIONS.includes(version.toLowerCase());
}

/**
 * Transforms a path to include the specified version segment.
 * e.g.,
 *   getVersionedPath('/api/users', 'v1') -> '/api/v1/users'
 *   getVersionedPath('/api/v1/users', 'v2') -> '/api/v2/users'
 *   getVersionedPath('/users', 'v1') -> '/api/v1/users'
 */
export function getVersionedPath(path: string, version: string): string {
  const cleanVersion = version.toLowerCase().startsWith('v')
    ? version.toLowerCase()
    : `v${version.toLowerCase()}`;

  // Path already starts with /api/vX
  if (/^\/api\/v\d+(?:\.\d+)?(?:\/|$)/i.test(path)) {
    return path.replace(/^\/api\/v\d+(?:\.\d+)?/i, `/api/${cleanVersion}`);
  }

  // Path is /api or /api/
  if (path === '/api' || path === '/api/') {
    return `/api/${cleanVersion}`;
  }

  // Path starts with /api/
  if (path.startsWith('/api/')) {
    return `/api/${cleanVersion}${path.slice(4)}`;
  }

  // Path does not start with /api/
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `/api/${cleanVersion}${normalizedPath}`;
}

/**
 * Checks whether a given version is marked as deprecated.
 */
export function isVersionDeprecated(version: string): boolean {
  const config = API_VERSION_CONFIGS[version.toLowerCase()];
  if (!config) return false;
  if (config.status === 'deprecated') return true;

  if (config.deprecationDate) {
    const depDate = new Date(config.deprecationDate);
    if (!isNaN(depDate.getTime()) && Date.now() >= depDate.getTime()) {
      return true;
    }
  }

  return false;
}

/**
 * Gets the sunset Date object for a version if defined.
 */
export function getSunsetDate(version: string): Date | null {
  const config = API_VERSION_CONFIGS[version.toLowerCase()];
  if (!config || !config.sunsetDate) return null;

  const date = new Date(config.sunsetDate);
  return isNaN(date.getTime()) ? null : date;
}

/**
 * RFC 8594 Sunset header helper.
 * Returns HTTP-date formatted string (e.g. "Wed, 11 Nov 2026 00:00:00 GMT") if sunset date exists, else null.
 */
export function getSunsetHeaderValue(version: string): string | null {
  const date = getSunsetDate(version);
  return date ? date.toUTCString() : null;
}

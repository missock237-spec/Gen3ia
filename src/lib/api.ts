// ============================================================
// API — Client-side fetch wrapper with credentials & error handling
// ============================================================

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

interface ApiFetchOptions extends RequestInit {
  params?: Record<string, string>;
}

/**
 * Client-side fetch wrapper with automatic credentials and error handling.
 *
 * Key behaviors:
 * - Automatically sends httpOnly cookies via `credentials: 'include'`
 * - Auto-sets `Content-Type: application/json` for string bodies
 * - On 401: throws ApiError — the auth store handles session refresh/logout centrally
 * - On other errors: throws ApiError with server error message
 */
export async function apiFetch<T = unknown>(
  path: string,
  options: ApiFetchOptions = {}
): Promise<T> {
  const { params, timeoutMs = 20_000, ...fetchOptions } = options;

  let url = path;
  if (params) {
    const searchParams = new URLSearchParams(params);
    url += `?${searchParams.toString()}`;
  }

  const headers = new Headers(fetchOptions.headers);
  if (!headers.has('Content-Type') && fetchOptions.body && typeof fetchOptions.body === 'string') {
    headers.set('Content-Type', 'application/json');
  }

  const controller = new AbortController();
  const timeoutId = timeoutMs > 0
    ? setTimeout(() => controller.abort(), timeoutMs)
    : undefined;

  try {
    const response = await fetch(url, {
      ...fetchOptions,
      headers,
      credentials: 'include',
      ...(timeoutId ? { signal: controller.signal } : {}),
    });

  if (response.status === 401) {
    // Préserve le message serveur quand il y en a un (ex: /api/auth/login
    // et /api/auth/register renvoient 401 avec { error: "ID token invalide
    // ou expiré" }). On ne remplace le message par 'Authentication required'
    // que si le serveur n'a pas fourni de détail, pour ne pas casser le
    // comportement des autres routes qui s'appuient sur ce message par défaut.
    let errorData: unknown;
    try {
      errorData = await response.json();
    } catch {
      errorData = null;
    }
    const serverMessage = (errorData as { error?: string } | null)?.error;
    throw new ApiError(serverMessage || 'Authentication required', 401);
  }

  if (!response.ok) {
    let errorData: unknown;
    try {
      errorData = await response.json();
    } catch {
      errorData = { error: 'Request failed' };
    }
    throw new ApiError(
      (errorData as { error?: string })?.error || 'Request failed',
      response.status
    );
  }

  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }
}

/**
 * Typed fetch wrapper for the VARUN-X server API.
 *
 * Every call is same-origin and relies on the HttpOnly session cookie. The
 * browser never holds a provider credential or a token.
 */

export class ApiError extends Error {
  status: number;
  code: string;
  details: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details ?? null;
  }
}

type Options = {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  signal?: AbortSignal;
  query?: Record<string, string | number | boolean | undefined | null>;
};

function buildQuery(query?: Options["query"]): string {
  if (!query) return "";
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "") continue;
    params.set(key, String(value));
  }
  const s = params.toString();
  return s ? `?${s}` : "";
}

export async function api<T>(path: string, options: Options = {}): Promise<T> {
  const { method = "GET", body, signal, query } = options;
  let res: Response;
  try {
    res = await fetch(`${path}${buildQuery(query)}`, {
      method,
      credentials: "same-origin",
      headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    throw new ApiError(0, "NETWORK", "The VARUN-X server is not reachable. Is it running?");
  }

  const text = await res.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }

  if (!res.ok) {
    const errObj = (payload as { error?: { code?: string; message?: string; details?: unknown } } | null)?.error;
    throw new ApiError(
      res.status,
      errObj?.code ?? "REQUEST_FAILED",
      errObj?.message ?? `Request failed with status ${res.status}`,
      errObj?.details,
    );
  }

  return payload as T;
}

/** Thrown by callers that need to distinguish "not signed in" from other errors. */
export function isUnauthenticated(err: unknown): boolean {
  return err instanceof ApiError && err.status === 401;
}

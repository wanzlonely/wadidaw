/** Client-side fetch with cookie + token backup (mobile-safe). */

const TOKEN_KEY = "walzpay_token";

export function getStoredToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setStoredToken(token: string | null) {
  if (typeof window === "undefined") return;
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

export function authHeaders(extra?: HeadersInit): HeadersInit {
  const token = getStoredToken() || "";
  return {
    ...(extra || {}),
    ...(token ? { "x-walz-token": token } : {}),
  };
}

export async function apiFetch(
  input: RequestInfo | URL,
  init: RequestInit = {}
): Promise<Response> {
  const headers = new Headers(init.headers || {});
  const token = getStoredToken();
  if (token && !headers.has("x-walz-token")) {
    headers.set("x-walz-token", token);
  }
  return fetch(input, {
    ...init,
    credentials: "include",
    headers,
  });
}

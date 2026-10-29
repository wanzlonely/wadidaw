"use client";

export function authHeaders(extra?: HeadersInit): HeadersInit {
  const token =
    typeof window !== "undefined"
      ? localStorage.getItem("walzpay_token") || ""
      : "";
  return {
    ...(extra || {}),
    ...(token ? { "x-walz-token": token } : {}),
  };
}

export async function apiFetch(input: string, init?: RequestInit) {
  const headers = new Headers(init?.headers || {});
  const token =
    typeof window !== "undefined"
      ? localStorage.getItem("walzpay_token") || ""
      : "";
  if (token) headers.set("x-walz-token", token);
  if (init?.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const res = await fetch(input, { ...init, headers });
  if (res.status === 401 && typeof window !== "undefined") {
    const path = window.location.pathname;
    if (!path.startsWith("/login") && !path.startsWith("/pay")) {
      localStorage.removeItem("walzpay_token");
      window.location.href = "/login";
    }
  }
  return res;
}

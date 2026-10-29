"use client";

/** @deprecated use lib/api.ts — kept for compatibility */
export {
  apiFetch,
  getStoredToken,
  setStoredToken,
} from "./api";

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

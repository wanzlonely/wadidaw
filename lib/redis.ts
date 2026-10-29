import { Redis } from "@upstash/redis";

export function getRedis(): Redis {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    throw new Error(
      "Missing UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN. Set them in Vercel env."
    );
  }
  return new Redis({ url, token });
}

export function hasRedisEnv(): boolean {
  return Boolean(
    process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
  );
}

/** Global keys */
export const KEYS = {
  users: "walzpay:users",
  sessions: "walzpay:sessions",
  a2f: "walzpay:a2f",
  captcha: "walzpay:captcha",
  seq: "walzpay:seq",
  payments: "walzpay:payments",
  orders: "walzpay:orders",
  logs: "walzpay:logs",
  forwards: "walzpay:forwards",
  service: "walzpay:service:active",
  dedup: "walzpay:dedup",
  live: "walzpay:live",
  qrisStatic: "walzpay:qris-static",
  settings: "walzpay:settings",
} as const;

/** Per-user data keys */
export function userKeys(userId: string) {
  const p = `walzpay:u:${userId}`;
  return {
    payments: `${p}:payments`,
    orders: `${p}:orders`,
    logs: `${p}:logs`,
    forwards: `${p}:forwards`,
    service: `${p}:service:active`,
    dedup: `${p}:dedup`,
    live: `${p}:live`,
    qrisStatic: `${p}:qris-static`,
    settings: `${p}:settings`,
  };
}

/** Legacy global keys (fallback migrasi) */
export const LEGACY_KEYS = {
  payments: "walzpay:payments",
  orders: "walzpay:orders",
  logs: "walzpay:logs",
  forwards: "walzpay:forwards",
  service: "walzpay:service:active",
  dedup: "walzpay:dedup",
  live: "walzpay:live",
  qrisStatic: "walzpay:qris-static",
  settings: "walzpay:settings",
} as const;

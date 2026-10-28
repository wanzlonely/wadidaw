import { Redis } from "@upstash/redis";

/**
 * Production store: Upstash Redis (REST).
 * Env (Vercel):
 *   UPSTASH_REDIS_REST_URL
 *   UPSTASH_REDIS_REST_TOKEN
 */
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

export const KEYS = {
  payments: "walzpay:payments",
  logs: "walzpay:logs",
  forwards: "walzpay:forwards",
  service: "walzpay:service:active",
  seq: "walzpay:seq",
} as const;

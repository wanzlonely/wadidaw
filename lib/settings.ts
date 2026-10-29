import { getRedis, KEYS, userKeys } from "./redis";
import { K } from "./tenant";

export type AppSettings = {
  displayName: string;
  apiKey: string;
  webhookSecret: string;
  feeType: "none" | "fixed" | "percent" | "random";
  feeValue: number;
  feeMin: number;
  feeMax: number;
  defaultExpiryMinutes: number;
  enabledMerchants: string[];
  passwordHash: string | null;
  updatedAt: string;
};

function randomKey(len = 32): string {
  const alphabet =
    "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let s = "";
  for (let i = 0; i < len; i++) {
    s += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return s;
}

function apiKeyIndexKey(apiKey: string): string {
  return `walzpay:apikey:${apiKey}`;
}

export function defaultSettings(): AppSettings {
  return {
    displayName: "WalzPay Merchant",
    apiKey: randomKey(40),
    webhookSecret: "",
    feeType: "random",
    feeValue: 0,
    feeMin: 1,
    feeMax: 99,
    defaultExpiryMinutes: 15,
    enabledMerchants: ["dana", "gopay", "whatsapp"],
    passwordHash: null,
    updatedAt: new Date().toISOString(),
  };
}

/** Multi-tenant: load settings for a specific user */
export async function getSettingsForUser(userId: string): Promise<AppSettings> {
  const redis = getRedis();
  const key = userKeys(userId).settings;
  const raw = await redis.get(key);
  if (!raw) {
    const d = defaultSettings();
    await redis.set(key, JSON.stringify(d));
    if (d.apiKey) {
      await indexApiKey(userId, d.apiKey).catch(() => {});
    }
    return d;
  }
  const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
  return { ...defaultSettings(), ...parsed } as AppSettings;
}

/** Multi-tenant: overwrite settings for a user */
export async function saveSettingsForUser(
  userId: string,
  settings: AppSettings
): Promise<void> {
  const redis = getRedis();
  const next: AppSettings = {
    ...defaultSettings(),
    ...settings,
    updatedAt: new Date().toISOString(),
  };
  await redis.set(userKeys(userId).settings, JSON.stringify(next));
  if (next.apiKey) {
    await indexApiKey(userId, next.apiKey).catch(() => {});
  }
}

/** Multi-tenant: partial update */
export async function updateSettingsForUser(
  userId: string,
  patch: Partial<AppSettings>
): Promise<AppSettings> {
  const cur = await getSettingsForUser(userId);
  const next: AppSettings = {
    ...cur,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  const redis = getRedis();
  await redis.set(userKeys(userId).settings, JSON.stringify(next));
  if (next.apiKey && next.apiKey !== cur.apiKey) {
    // drop old index if key changed
    if (cur.apiKey) {
      await redis.del(apiKeyIndexKey(cur.apiKey)).catch(() => {});
    }
    await indexApiKey(userId, next.apiKey).catch(() => {});
  }
  return next;
}

/** Multi-tenant: rotate API key */
export async function rotateApiKeyForUser(userId: string): Promise<AppSettings> {
  const cur = await getSettingsForUser(userId);
  const newKey = randomKey(40);
  const redis = getRedis();
  if (cur.apiKey) {
    await redis.del(apiKeyIndexKey(cur.apiKey)).catch(() => {});
  }
  return updateSettingsForUser(userId, { apiKey: newKey });
}

/** Index apiKey -> userId for webhook auth */
export async function indexApiKey(userId: string, apiKey: string): Promise<void> {
  if (!apiKey || !userId) return;
  const redis = getRedis();
  await redis.set(apiKeyIndexKey(apiKey), userId);
}

/** Resolve userId from API key (webhook) */
export async function findUserIdByApiKey(
  apiKey: string
): Promise<string | null> {
  if (!apiKey) return null;
  const redis = getRedis();
  const uid = await redis.get(apiKeyIndexKey(apiKey.trim()));
  if (!uid) return null;
  return typeof uid === "string" ? uid : String(uid);
}

// ─── Legacy helpers (tenant via setTenant / K()) ───────────────────────────

export async function getSettings(): Promise<AppSettings> {
  const redis = getRedis();
  const key = K().settings;
  const raw = await redis.get(key);
  if (!raw) {
    const d = defaultSettings();
    await redis.set(key, JSON.stringify(d));
    return d;
  }
  const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
  return { ...defaultSettings(), ...parsed } as AppSettings;
}

export async function updateSettings(
  patch: Partial<AppSettings>
): Promise<AppSettings> {
  const cur = await getSettings();
  const next: AppSettings = {
    ...cur,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  const redis = getRedis();
  await redis.set(K().settings, JSON.stringify(next));
  return next;
}

export async function rotateApiKey(): Promise<AppSettings> {
  return updateSettings({ apiKey: randomKey(40) });
}

export async function hashPassword(plain: string): Promise<string> {
  const data = new TextEncoder().encode(plain);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function verifyPassword(plain: string): Promise<boolean> {
  const s = await getSettings();
  if (!s.passwordHash) return true;
  const h = await hashPassword(plain);
  return h === s.passwordHash;
}

// keep KEYS import used for typecheck silence
void KEYS;

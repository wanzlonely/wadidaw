import { getRedis, KEYS } from "./redis";

export type AppSettings = {
  displayName: string;
  apiKey: string;
  webhookSecret: string;
  feeType: "none" | "fixed" | "percent";
  feeValue: number;
  defaultExpiryMinutes: number;
  passwordHash: string | null;
  updatedAt: string;
};

function randomKey(len = 32): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let s = "";
  for (let i = 0; i < len; i++) {
    s += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return s;
}

export function defaultSettings(): AppSettings {
  return {
    displayName: "WalzPay Merchant",
    apiKey: randomKey(40),
    webhookSecret: "",
    feeType: "none",
    feeValue: 0,
    defaultExpiryMinutes: 30,
    passwordHash: null,
    updatedAt: new Date().toISOString(),
  };
}

export async function getSettings(): Promise<AppSettings> {
  const redis = getRedis();
  const raw = await redis.get(KEYS.settings);
  if (!raw) {
    const d = defaultSettings();
    await redis.set(KEYS.settings, JSON.stringify(d));
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
  await redis.set(KEYS.settings, JSON.stringify(next));
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

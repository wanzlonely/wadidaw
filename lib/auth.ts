import { getRedis, hasRedisEnv } from "./redis";
import { cookies } from "next/headers";

export type User = {
  id: string;
  email: string;
  displayName: string;
  passwordHash: string;
  a2fEnabled: boolean;
  createdAt: string;
  updatedAt: string;
};

export type Session = {
  sid: string;
  userId: string;
  email: string;
  displayName: string;
  expiresAt: number;
};

const SESSION_TTL_SEC = 60 * 60 * 24 * 14; // 14 days
export const COOKIE_NAME = "walz_sid";

function userKey(email: string) {
  return `walzpay:user:${email.toLowerCase().trim()}`;
}

function sessionKey(sid: string) {
  return `walzpay:session:${sid}`;
}

function userIdKey(id: string) {
  return `walzpay:uid:${id}`;
}

export function scopedKey(userId: string, name: string) {
  return `walzpay:u:${userId}:${name}`;
}

export async function hashPassword(plain: string): Promise<string> {
  const data = new TextEncoder().encode(plain + "|walzpay-v1");
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function randomDigits(len: number): string {
  let s = "";
  for (let i = 0; i < len; i++) {
    s += Math.floor(Math.random() * 10).toString();
  }
  return s;
}

function randomSid(len = 24): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let s = "";
  for (let i = 0; i < len; i++) {
    s += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return s;
}

/** Format: WLZPY + 7 digits  e.g. WLZPY2728281 */
async function generateShortUserId(): Promise<string> {
  const redis = getRedis();
  for (let attempt = 0; attempt < 12; attempt++) {
    const id = "WLZPY" + randomDigits(7);
    const exists = await redis.get(userIdKey(id));
    if (!exists) return id;
  }
  return "WLZPY" + randomDigits(7) + randomDigits(2);
}

export async function findUserByEmail(email: string): Promise<User | null> {
  if (!hasRedisEnv()) return null;
  const redis = getRedis();
  const raw = await redis.get(userKey(email));
  if (!raw) return null;
  return (typeof raw === "string" ? JSON.parse(raw) : raw) as User;
}

export async function findUserById(id: string): Promise<User | null> {
  if (!hasRedisEnv()) return null;
  const redis = getRedis();
  const email = await redis.get(userIdKey(id));
  if (!email || typeof email !== "string") return null;
  return findUserByEmail(email);
}

export async function createUser(input: {
  email: string;
  password: string;
  displayName: string;
}): Promise<{ ok: true; user: User } | { ok: false; error: string }> {
  const email = input.email.toLowerCase().trim();
  if (!email || !email.includes("@") || email.length < 5) {
    return { ok: false, error: "Email tidak valid" };
  }
  if (input.password.length < 6) {
    return { ok: false, error: "Password minimal 6 karakter" };
  }
  const name = (input.displayName || email.split("@")[0]).trim().slice(0, 40);
  if (!name) return { ok: false, error: "Nama tampilan wajib" };

  const existing = await findUserByEmail(email);
  if (existing) return { ok: false, error: "Email sudah terdaftar" };

  const id = await generateShortUserId();
  const user: User = {
    id,
    email,
    displayName: name,
    passwordHash: await hashPassword(input.password),
    a2fEnabled: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const redis = getRedis();
  await redis.set(userKey(email), JSON.stringify(user));
  await redis.set(userIdKey(user.id), email);
  return { ok: true, user };
}

export async function verifyUserPassword(
  email: string,
  password: string
): Promise<User | null> {
  const user = await findUserByEmail(email);
  if (!user) return null;
  const h = await hashPassword(password);
  if (h !== user.passwordHash) return null;
  return user;
}

export async function updateUser(
  userId: string,
  patch: Partial<Pick<User, "displayName" | "passwordHash" | "a2fEnabled">>
): Promise<User | null> {
  const user = await findUserById(userId);
  if (!user) return null;
  const next: User = {
    ...user,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  const redis = getRedis();
  await redis.set(userKey(user.email), JSON.stringify(next));
  return next;
}

export async function createSession(user: User): Promise<string> {
  const sid = randomSid(32);
  const session: Session = {
    sid,
    userId: user.id,
    email: user.email,
    displayName: user.displayName,
    expiresAt: Date.now() + SESSION_TTL_SEC * 1000,
  };
  const redis = getRedis();
  await redis.set(sessionKey(sid), JSON.stringify(session), {
    ex: SESSION_TTL_SEC,
  });
  return sid;
}

export async function destroySession(sid: string) {
  if (!sid) return;
  const redis = getRedis();
  await redis.del(sessionKey(sid));
}

export async function getSessionFromSid(
  sid: string | undefined | null
): Promise<Session | null> {
  if (!sid || !hasRedisEnv()) return null;
  const redis = getRedis();
  const raw = await redis.get(sessionKey(sid));
  if (!raw) return null;
  const s = (typeof raw === "string" ? JSON.parse(raw) : raw) as Session;
  if (s.expiresAt < Date.now()) {
    await redis.del(sessionKey(sid));
    return null;
  }
  return s;
}

export async function getSession(): Promise<Session | null> {
  try {
    const jar = await cookies();
    const sid = jar.get(COOKIE_NAME)?.value;
    return getSessionFromSid(sid);
  } catch {
    return null;
  }
}

/** Resolve session from cookie OR x-walz-token / Authorization Bearer (mobile backup). */
export async function resolveSession(
  req: { cookies: { get: (n: string) => { value: string } | undefined }; headers: { get: (n: string) => string | null } }
): Promise<Session | null> {
  const fromCookie = req.cookies.get(COOKIE_NAME)?.value;
  if (fromCookie) {
    const s = await getSessionFromSid(fromCookie);
    if (s) return s;
  }
  const hdr =
    req.headers.get("x-walz-token") ||
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ||
    "";
  if (hdr) {
    return getSessionFromSid(hdr.trim());
  }
  return null;
}

/** Cookie options — always Secure on Vercel/HTTPS */
export function cookieOpts(maxAge = SESSION_TTL_SEC) {
  const isProd =
    process.env.NODE_ENV === "production" || Boolean(process.env.VERCEL);
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}

export async function issueOtp(userId: string): Promise<string> {
  const code = String(Math.floor(100000 + Math.random() * 900000));
  const redis = getRedis();
  await redis.set(`walzpay:otp:${userId}`, code, { ex: 300 });
  return code;
}

export async function verifyOtp(userId: string, code: string): Promise<boolean> {
  const redis = getRedis();
  const stored = await redis.get(`walzpay:otp:${userId}`);
  if (!stored) return false;
  if (String(stored) !== String(code).trim()) return false;
  await redis.del(`walzpay:otp:${userId}`);
  return true;
}

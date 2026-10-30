import { getRedis, hasRedisEnv } from "./redis";
import { cookies } from "next/headers";

export type User = {
  id: string;
  email: string;
  username: string;
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

function usernameKey(username: string) {
  return `walzpay:username:${username.toLowerCase().trim()}`;
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

/** Normalize username: a-z0-9_ only, 3–24 chars */
export function normalizeUsername(raw: string): string {
  return raw
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_]/g, "")
    .slice(0, 24);
}

export function isValidUsername(u: string): boolean {
  return /^[a-z][a-z0-9_]{2,23}$/.test(u);
}

async function reserveUsername(username: string, userId: string): Promise<boolean> {
  const redis = getRedis();
  const key = usernameKey(username);
  const existing = await redis.get(key);
  if (existing && String(existing) !== userId) return false;
  await redis.set(key, userId);
  return true;
}

async function releaseUsername(username: string) {
  if (!username) return;
  const redis = getRedis();
  await redis.del(usernameKey(username)).catch(() => {});
}

function ensureUsername(user: User): User {
  if (user.username && isValidUsername(user.username)) return user;
  const fallback = normalizeUsername(
    user.username || user.displayName || user.email.split("@")[0] || "user"
  );
  const u = isValidUsername(fallback) ? fallback : `user${user.id.slice(-6).toLowerCase()}`;
  return { ...user, username: u };
}

export async function findUserByEmail(email: string): Promise<User | null> {
  if (!hasRedisEnv()) return null;
  const redis = getRedis();
  const raw = await redis.get(userKey(email));
  if (!raw) return null;
  const user = (typeof raw === "string" ? JSON.parse(raw) : raw) as User;
  return ensureUsername(user);
}

export async function findUserById(id: string): Promise<User | null> {
  if (!hasRedisEnv()) return null;
  const redis = getRedis();
  const email = await redis.get(userIdKey(id));
  if (!email || typeof email !== "string") return null;
  return findUserByEmail(email);
}

export async function findUserByUsername(username: string): Promise<User | null> {
  if (!hasRedisEnv()) return null;
  const u = normalizeUsername(username);
  if (!u) return null;
  const redis = getRedis();
  const uid = await redis.get(usernameKey(u));
  if (!uid) return null;
  return findUserById(String(uid));
}

export async function createUser(input: {
  email: string;
  password: string;
  displayName: string;
  username?: string;
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

  let username = normalizeUsername(
    input.username || name || email.split("@")[0] || "user"
  );
  if (!isValidUsername(username)) {
    username = normalizeUsername(`user${Date.now().toString(36).slice(-6)}`);
  }
  if (!isValidUsername(username)) {
    return { ok: false, error: "Username tidak valid (huruf kecil, angka, _ )" };
  }

  const existing = await findUserByEmail(email);
  if (existing) return { ok: false, error: "Email sudah terdaftar" };

  const taken = await findUserByUsername(username);
  if (taken) return { ok: false, error: "Username sudah digunakan" };

  const id = await generateShortUserId();
  const reserved = await reserveUsername(username, id);
  if (!reserved) return { ok: false, error: "Username sudah digunakan" };

  const user: User = {
    id,
    email,
    username,
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
  patch: Partial<Pick<User, "displayName" | "username" | "passwordHash" | "a2fEnabled">>
): Promise<User | null> {
  const user = await findUserById(userId);
  if (!user) return null;

  let nextUsername = user.username;
  if (patch.username != null) {
    const nu = normalizeUsername(String(patch.username));
    if (!isValidUsername(nu)) {
      throw new Error("Username tidak valid (3–24 karakter, mulai huruf)");
    }
    if (nu !== user.username) {
      const taken = await findUserByUsername(nu);
      if (taken && taken.id !== userId) {
        throw new Error("Username sudah digunakan");
      }
      await releaseUsername(user.username);
      const ok = await reserveUsername(nu, userId);
      if (!ok) throw new Error("Username sudah digunakan");
      nextUsername = nu;
    }
  }

  const next: User = {
    ...user,
    ...patch,
    username: nextUsername,
    displayName:
      patch.displayName != null
        ? String(patch.displayName).trim().slice(0, 40)
        : user.displayName,
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
  req: {
    cookies: { get: (n: string) => { value: string } | undefined };
    headers: { get: (n: string) => string | null };
  }
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

import { getRedis, KEYS } from "./redis";
import { sendOtpEmail } from "./email";

export type User = {
  id: string;
  email: string;
  displayName: string;
  passwordHash: string;
  a2fEnabled: boolean;
  a2fSecret: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Session = {
  token: string;
  userId: string;
  email: string;
  createdAt: string;
  expiresAt: string;
  a2fVerified: boolean;
};

async function hashPassword(plain: string): Promise<string> {
  const data = new TextEncoder().encode(plain + ":walzpay-salt-v1");
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function randomToken(len = 40): string {
  const alphabet =
    "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let s = "";
  for (let i = 0; i < len; i++) {
    s += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return s;
}

function randomDigits(len: number): string {
  let s = "";
  for (let i = 0; i < len; i++) {
    s += Math.floor(Math.random() * 10).toString();
  }
  return s;
}

/** Format: WLZPY + 7 digits e.g. WLZPY2728281 */
function shortUserId(): string {
  return "WLZPY" + randomDigits(7);
}

function randomOtp(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

async function loadUsers(): Promise<User[]> {
  const redis = getRedis();
  const raw = await redis.get(KEYS.users);
  if (!raw) return [];
  if (typeof raw === "string") return JSON.parse(raw) as User[];
  return raw as User[];
}

async function saveUsers(users: User[]) {
  const redis = getRedis();
  await redis.set(KEYS.users, JSON.stringify(users));
}

export async function registerUser(input: {
  email: string;
  password: string;
  displayName: string;
}): Promise<{ ok: true; user: Omit<User, "passwordHash"> } | { ok: false; error: string }> {
  const email = input.email.trim().toLowerCase();
  if (!email || !email.includes("@")) {
    return { ok: false, error: "Email tidak valid" };
  }
  if (input.password.length < 6) {
    return { ok: false, error: "Password minimal 6 karakter" };
  }
  const users = await loadUsers();
  if (users.some((u) => u.email === email)) {
    return { ok: false, error: "Email sudah terdaftar" };
  }
  const now = new Date().toISOString();
  let id = shortUserId();
  const used = new Set(users.map((u) => u.id));
  let guard = 0;
  while (used.has(id) && guard < 20) {
    id = shortUserId();
    guard++;
  }
  const user: User = {
    id,
    email,
    displayName: input.displayName.trim() || email.split("@")[0],
    passwordHash: await hashPassword(input.password),
    a2fEnabled: true,
    a2fSecret: null,
    createdAt: now,
    updatedAt: now,
  };
  users.push(user);
  await saveUsers(users);
  const { passwordHash: _, ...safe } = user;
  return { ok: true, user: safe };
}

export async function loginUser(input: {
  email: string;
  password: string;
}): Promise<
  | { ok: true; session: Session; needA2f: boolean; otpPreview?: string; emailSent?: boolean }
  | { ok: false; error: string }
> {
  const email = input.email.trim().toLowerCase();
  const users = await loadUsers();
  const user = users.find((u) => u.email === email);
  if (!user) return { ok: false, error: "Email atau password salah" };
  const h = await hashPassword(input.password);
  if (h !== user.passwordHash) {
    return { ok: false, error: "Email atau password salah" };
  }

  const now = Date.now();
  const session: Session = {
    token: randomToken(48),
    userId: user.id,
    email: user.email,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + 7 * 24 * 60 * 60 * 1000).toISOString(),
    a2fVerified: !user.a2fEnabled,
  };

  const redis = getRedis();
  await redis.set(`${KEYS.sessions}:${session.token}`, JSON.stringify(session), {
    ex: 7 * 24 * 60 * 60,
  });

  let otpPreview: string | undefined;
  let emailSent = false;
  if (user.a2fEnabled) {
    const otp = randomOtp();
    await redis.set(`${KEYS.a2f}:${session.token}`, otp, { ex: 300 });
    const mail = await sendOtpEmail(user.email, otp, "login");
    emailSent = mail.ok;
    if (!mail.ok) otpPreview = otp;
  }

  return { ok: true, session, needA2f: user.a2fEnabled, otpPreview, emailSent };
}

export async function changePassword(
  userId: string,
  oldPassword: string,
  newPassword: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (newPassword.length < 6) {
    return { ok: false, error: "Password baru minimal 6 karakter" };
  }
  const users = await loadUsers();
  const u = users.find((x) => x.id === userId);
  if (!u) return { ok: false, error: "User tidak ditemukan" };
  const oldH = await hashPassword(oldPassword);
  if (oldH !== u.passwordHash) {
    return { ok: false, error: "Password lama salah" };
  }
  u.passwordHash = await hashPassword(newPassword);
  u.updatedAt = new Date().toISOString();
  await saveUsers(users);
  return { ok: true };
}

export async function verifyA2f(
  token: string,
  code: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const redis = getRedis();
  const stored = await redis.get(`${KEYS.a2f}:${token}`);
  if (!stored || String(stored) !== String(code).trim()) {
    return { ok: false, error: "Kode A2F salah atau kedaluwarsa" };
  }
  const raw = await redis.get(`${KEYS.sessions}:${token}`);
  if (!raw) return { ok: false, error: "Sesi tidak valid" };
  const session: Session =
    typeof raw === "string" ? JSON.parse(raw) : (raw as Session);
  session.a2fVerified = true;
  await redis.set(`${KEYS.sessions}:${token}`, JSON.stringify(session), {
    ex: 7 * 24 * 60 * 60,
  });
  await redis.del(`${KEYS.a2f}:${token}`);
  return { ok: true };
}

export async function enableA2f(
  userId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const users = await loadUsers();
  const u = users.find((x) => x.id === userId);
  if (!u) return { ok: false, error: "User tidak ditemukan" };
  u.a2fEnabled = true;
  u.a2fSecret = randomToken(16);
  u.updatedAt = new Date().toISOString();
  await saveUsers(users);
  return { ok: true };
}

export async function disableA2f(
  userId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const users = await loadUsers();
  const u = users.find((x) => x.id === userId);
  if (!u) return { ok: false, error: "User tidak ditemukan" };
  u.a2fEnabled = false;
  u.a2fSecret = null;
  u.updatedAt = new Date().toISOString();
  await saveUsers(users);
  return { ok: true };
}

export async function getSession(
  token: string | null | undefined
): Promise<Session | null> {
  if (!token) return null;
  const redis = getRedis();
  const raw = await redis.get(`${KEYS.sessions}:${token}`);
  if (!raw) return null;
  const session: Session =
    typeof raw === "string" ? JSON.parse(raw) : (raw as Session);
  if (new Date(session.expiresAt).getTime() < Date.now()) {
    await redis.del(`${KEYS.sessions}:${token}`);
    return null;
  }
  return session;
}

export async function getUserById(id: string): Promise<User | null> {
  const users = await loadUsers();
  return users.find((u) => u.id === id) ?? null;
}

export async function createCaptcha(): Promise<{ id: string; waitMs: number }> {
  const id = randomToken(24);
  const waitMs = 2000;
  const redis = getRedis();
  await redis.set(
    `${KEYS.captcha}:${id}`,
    JSON.stringify({ createdAt: Date.now(), waitMs, solved: false }),
    { ex: 120 }
  );
  return { id, waitMs };
}

export async function solveCaptcha(
  id: string
): Promise<{ ok: true; token: string } | { ok: false; error: string }> {
  const redis = getRedis();
  const raw = await redis.get(`${KEYS.captcha}:${id}`);
  if (!raw) return { ok: false, error: "Captcha kedaluwarsa, muat ulang" };
  const data =
    typeof raw === "string"
      ? (JSON.parse(raw) as { createdAt: number; waitMs: number; solved: boolean })
      : (raw as { createdAt: number; waitMs: number; solved: boolean });
  const elapsed = Date.now() - data.createdAt;
  if (elapsed < data.waitMs) {
    return {
      ok: false,
      error: `Tunggu ${Math.ceil((data.waitMs - elapsed) / 1000)} detik lagi`,
    };
  }
  const token = randomToken(32);
  await redis.set(`${KEYS.captcha}:ok:${token}`, "1", { ex: 300 });
  await redis.del(`${KEYS.captcha}:${id}`);
  return { ok: true, token };
}

export async function verifyCaptchaToken(
  token: string | null | undefined
): Promise<boolean> {
  if (!token) return false;
  const redis = getRedis();
  const v = await redis.get(`${KEYS.captcha}:ok:${token}`);
  if (!v) return false;
  await redis.del(`${KEYS.captcha}:ok:${token}`);
  return true;
}

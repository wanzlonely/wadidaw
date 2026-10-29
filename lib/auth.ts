import { getRedis, KEYS } from "./redis";

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
  const user: User = {
    id: `usr_${Date.now()}_${randomToken(6)}`,
    email,
    displayName: input.displayName.trim() || email.split("@")[0],
    passwordHash: await hashPassword(input.password),
    a2fEnabled: false,
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
  | { ok: true; session: Session; needA2f: boolean; otpPreview?: string }
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
  if (user.a2fEnabled) {
    const otp = randomOtp();
    await redis.set(`${KEYS.a2f}:${session.token}`, otp, { ex: 300 });
    // Demo: OTP dikembalikan agar bisa dites tanpa SMS/email gateway
    otpPreview = otp;
  }

  return { ok: true, session, needA2f: user.a2fEnabled, otpPreview };
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

/** Skor perilaku manusia: mouse/touch movement, timing, focus */
export function scoreHumanBehavior(signals: {
  moveCount?: number;
  keyCount?: number;
  durationMs?: number;
  focusEvents?: number;
}): { human: boolean; score: number } {
  const move = signals.moveCount ?? 0;
  const keys = signals.keyCount ?? 0;
  const dur = signals.durationMs ?? 0;
  const focus = signals.focusEvents ?? 0;
  let score = 0;
  if (move >= 3) score += 30;
  else if (move >= 1) score += 10;
  if (keys >= 2) score += 25;
  if (dur >= 1500) score += 25;
  else if (dur >= 600) score += 10;
  if (focus >= 1) score += 20;
  return { human: score >= 50, score };
}

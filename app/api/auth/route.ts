import { NextRequest, NextResponse } from "next/server";
import {
  createUser,
  verifyUserPassword,
  createSession,
  destroySession,
  resolveSession,
  cookieOpts,
  COOKIE_NAME,
  issueOtp,
  verifyOtp,
  updateUser,
  hashPassword,
  findUserById,
} from "@/lib/auth";
import { hasRedisEnv } from "@/lib/redis";
import {
  defaultSettings,
  getSettingsForUser,
  saveSettingsForUser,
} from "@/lib/settings";
import { sendOtpEmail } from "@/lib/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getSid(req: NextRequest): string | undefined {
  return req.cookies.get(COOKIE_NAME)?.value;
}

function setSessionCookie(res: NextResponse, sid: string) {
  res.cookies.set(COOKIE_NAME, sid, cookieOpts());
}

function clearSessionCookie(res: NextResponse) {
  res.cookies.set(COOKIE_NAME, "", {
    ...cookieOpts(0),
    maxAge: 0,
  });
}

async function destroyAllSessions(req: NextRequest) {
  const fromCookie = getSid(req);
  if (fromCookie) await destroySession(fromCookie);
  const hdr =
    req.headers.get("x-walz-token") ||
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ||
    "";
  const token = hdr.trim();
  if (token && token !== fromCookie) {
    await destroySession(token);
  }
}

export async function GET(req: NextRequest) {
  if (!hasRedisEnv()) {
    return NextResponse.json({ error: "Redis not configured" }, { status: 503 });
  }
  const session = await resolveSession(req);
  if (!session) {
    return NextResponse.json({ authenticated: false });
  }
  const user = await findUserById(session.userId);
  return NextResponse.json({
    authenticated: true,
    user: {
      id: session.userId,
      email: session.email,
      displayName: session.displayName,
      a2fEnabled: user?.a2fEnabled ?? false,
      hasPassword: Boolean(user?.passwordHash),
      createdAt: user?.createdAt ?? null,
      updatedAt: user?.updatedAt ?? null,
    },
  });
}

export async function POST(req: NextRequest) {
  if (!hasRedisEnv()) {
    return NextResponse.json({ error: "Redis not configured" }, { status: 503 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const action = String(body.action || "");

  if (action === "me") {
    const session = await resolveSession(req);
    if (!session) {
      return NextResponse.json({ error: "Belum login" }, { status: 401 });
    }
    const user = await findUserById(session.userId);
    if (!user) {
      return NextResponse.json({ error: "User tidak ditemukan" }, { status: 404 });
    }
    return NextResponse.json({
      ok: true,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        a2fEnabled: user.a2fEnabled,
        hasPassword: Boolean(user.passwordHash),
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
    });
  }

  if (action === "register") {
    const email = String(body.email || "");
    const password = String(body.password || "");
    const password2 = String(body.password2 || "");
    const displayName = String(body.displayName || "");
    const captchaAnswer = String(body.captchaAnswer || "").trim();
    const captchaExpected = String(body.captchaExpected || "").trim();

    if (!captchaAnswer || captchaAnswer !== captchaExpected) {
      return NextResponse.json({ error: "Jawaban verifikasi salah" }, { status: 400 });
    }
    if (password !== password2) {
      return NextResponse.json({ error: "Konfirmasi password tidak cocok" }, { status: 400 });
    }

    const result = await createUser({ email, password, displayName });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    const settings = defaultSettings();
    settings.displayName = result.user.displayName;
    await saveSettingsForUser(result.user.id, settings);

    const otp = await issueOtp(result.user.id);
    const mail = await sendOtpEmail(result.user.email, otp, "register");
    if (!mail.ok) console.error("[auth] OTP email failed:", mail.error);

    return NextResponse.json({
      ok: true,
      needOtp: true,
      userId: result.user.id,
      email: result.user.email,
      message: mail.ok
        ? `Kode OTP dikirim ke ${result.user.email}`
        : "Gagal mengirim email OTP. Cek GMAIL_USER / GMAIL_APP_PASSWORD di environment, lalu kirim ulang.",
      emailSent: mail.ok,
    });
  }

  if (action === "login") {
    const email = String(body.email || "");
    const password = String(body.password || "");
    const captchaAnswer = String(body.captchaAnswer || "").trim();
    const captchaExpected = String(body.captchaExpected || "").trim();

    if (!captchaAnswer || captchaAnswer !== captchaExpected) {
      return NextResponse.json({ error: "Jawaban verifikasi salah" }, { status: 400 });
    }

    const user = await verifyUserPassword(email, password);
    if (!user) {
      return NextResponse.json({ error: "Email atau password salah" }, { status: 401 });
    }

    if (user.a2fEnabled) {
      const otp = await issueOtp(user.id);
      const mail = await sendOtpEmail(user.email, otp, "login");
      return NextResponse.json({
        ok: true,
        needOtp: true,
        userId: user.id,
        email: user.email,
        message: mail.ok
          ? `Kode OTP dikirim ke ${user.email}`
          : "Gagal mengirim email OTP. Cek GMAIL_USER / GMAIL_APP_PASSWORD di environment, lalu kirim ulang.",
        emailSent: mail.ok,
      });
    }

    const sid = await createSession(user);
    const res = NextResponse.json({
      ok: true,
      token: sid,
      user: { id: user.id, email: user.email, displayName: user.displayName },
    });
    setSessionCookie(res, sid);
    return res;
  }

  if (action === "resend_otp") {
    const userId = String(body.userId || "");
    const user = await findUserById(userId);
    if (!user) {
      return NextResponse.json({ error: "User tidak ditemukan" }, { status: 404 });
    }
    const otp = await issueOtp(user.id);
    const mail = await sendOtpEmail(user.email, otp, "login");
    return NextResponse.json({
      ok: true,
      message: mail.ok
        ? `OTP baru dikirim ke ${user.email}`
        : "Gagal kirim email OTP. Cek environment Gmail, lalu coba lagi.",
      emailSent: mail.ok,
    });
  }

  if (action === "verify_otp") {
    const userId = String(body.userId || "");
    const code = String(body.code || "");
    if (!userId || !code) {
      return NextResponse.json({ error: "OTP wajib" }, { status: 400 });
    }
    const ok = await verifyOtp(userId, code);
    if (!ok) {
      return NextResponse.json({ error: "OTP salah atau kedaluwarsa" }, { status: 401 });
    }
    const user = await findUserById(userId);
    if (!user) {
      return NextResponse.json({ error: "User tidak ditemukan" }, { status: 404 });
    }
    const sid = await createSession(user);
    const res = NextResponse.json({
      ok: true,
      token: sid,
      user: { id: user.id, email: user.email, displayName: user.displayName },
    });
    setSessionCookie(res, sid);
    return res;
  }

  if (action === "logout") {
    await destroyAllSessions(req);
    const res = NextResponse.json({ ok: true });
    clearSessionCookie(res);
    return res;
  }

  if (action === "change_password") {
    const session = await resolveSession(req);
    if (!session) {
      return NextResponse.json({ error: "Belum login" }, { status: 401 });
    }
    const oldPassword = String(body.oldPassword || "").trim();
    const newPassword = String(body.newPassword || body.password || "").trim();
    if (!oldPassword) {
      return NextResponse.json({ error: "Password lama wajib diisi" }, { status: 400 });
    }
    if (newPassword.length < 6) {
      return NextResponse.json(
        { error: "Password baru minimal 6 karakter" },
        { status: 400 }
      );
    }
    if (oldPassword === newPassword) {
      return NextResponse.json(
        { error: "Password baru harus berbeda dari password lama" },
        { status: 400 }
      );
    }

    // Verify old password against stored hash via same path as login
    const matched = await verifyUserPassword(session.email, oldPassword);
    if (!matched) {
      return NextResponse.json({ error: "Password lama salah" }, { status: 401 });
    }

    const updated = await updateUser(session.userId, {
      passwordHash: await hashPassword(newPassword),
    });
    if (!updated) {
      return NextResponse.json({ error: "Gagal update password" }, { status: 500 });
    }
    return NextResponse.json({ ok: true, message: "Password berhasil diubah" });
  }

  if (action === "enable_a2f" || action === "disable_a2f") {
    const session = await resolveSession(req);
    if (!session) {
      return NextResponse.json({ error: "Belum login" }, { status: 401 });
    }
    const enable = action === "enable_a2f";
    const user = await updateUser(session.userId, { a2fEnabled: enable });
    if (!user) {
      return NextResponse.json({ error: "User tidak ditemukan" }, { status: 404 });
    }
    return NextResponse.json({
      ok: true,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        a2fEnabled: user.a2fEnabled,
      },
    });
  }

  if (action === "update_profile") {
    const session = await resolveSession(req);
    if (!session) {
      return NextResponse.json({ error: "Belum login" }, { status: 401 });
    }
    const patch: Parameters<typeof updateUser>[1] = {};
    if (body.displayName != null) {
      patch.displayName = String(body.displayName).trim().slice(0, 40);
    }
    if (body.a2fEnabled != null) {
      patch.a2fEnabled = Boolean(body.a2fEnabled);
    }
    if (body.password != null && String(body.password).length >= 6) {
      patch.passwordHash = await hashPassword(String(body.password));
    }
    const user = await updateUser(session.userId, patch);
    if (!user) {
      return NextResponse.json({ error: "User tidak ditemukan" }, { status: 404 });
    }
    if (patch.displayName) {
      const s = await getSettingsForUser(session.userId);
      s.displayName = user.displayName;
      await saveSettingsForUser(session.userId, s);
    }
    return NextResponse.json({
      ok: true,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        a2fEnabled: user.a2fEnabled,
      },
    });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

import { NextRequest, NextResponse } from "next/server";
import {
  registerUser,
  loginUser,
  verifyA2f,
  getSession,
  getUserById,
  enableA2f,
  disableA2f,
  changePassword,
  createCaptcha,
  solveCaptcha,
  verifyCaptchaToken,
} from "@/lib/auth";
import { hasRedisEnv } from "@/lib/redis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

  if (action === "captcha_create") {
    const c = await createCaptcha();
    return NextResponse.json({ ok: true, ...c });
  }

  if (action === "captcha_solve") {
    const result = await solveCaptcha(String(body.id || ""));
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({ ok: true, captchaToken: result.token });
  }

  if (action === "register" || action === "login") {
    const captchaToken = String(body.captchaToken || "");
    const okCap = await verifyCaptchaToken(captchaToken);
    if (!okCap) {
      return NextResponse.json(
        { error: "Selesaikan verifikasi captcha terlebih dahulu" },
        { status: 403 }
      );
    }
  }

  if (action === "register") {
    const result = await registerUser({
      email: String(body.email || ""),
      password: String(body.password || ""),
      displayName: String(body.displayName || ""),
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({ ok: true, user: result.user });
  }

  if (action === "login") {
    const result = await loginUser({
      email: String(body.email || ""),
      password: String(body.password || ""),
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 401 });
    }
    return NextResponse.json({
      ok: true,
      token: result.session.token,
      needA2f: result.needA2f,
      emailSent: result.emailSent ?? false,
      email: result.session.email,
    });
  }

  if (action === "verify_a2f") {
    const token = String(body.token || "");
    const code = String(body.code || "");
    const result = await verifyA2f(token, code);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 401 });
    }
    return NextResponse.json({ ok: true });
  }

  if (action === "change_password") {
    const token = String(body.token || "");
    const session = await getSession(token);
    if (!session || !session.a2fVerified) {
      return NextResponse.json({ error: "Sesi tidak valid" }, { status: 401 });
    }
    const result = await changePassword(
      session.userId,
      String(body.oldPassword || ""),
      String(body.newPassword || "")
    );
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  }

  if (action === "enable_a2f" || action === "disable_a2f") {
    const token = String(body.token || "");
    const session = await getSession(token);
    if (!session || !session.a2fVerified) {
      return NextResponse.json({ error: "Sesi tidak valid" }, { status: 401 });
    }
    const result =
      action === "enable_a2f"
        ? await enableA2f(session.userId)
        : await disableA2f(session.userId);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  }

  if (action === "me") {
    const token = String(body.token || "");
    const session = await getSession(token);
    if (!session) {
      return NextResponse.json({ error: "Sesi tidak valid" }, { status: 401 });
    }
    const user = await getUserById(session.userId);
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
        hasPassword: true,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
      a2fVerified: session.a2fVerified,
    });
  }

  if (action === "logout") {
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "action tidak dikenal" }, { status: 400 });
}

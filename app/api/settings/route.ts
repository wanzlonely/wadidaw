import { NextRequest, NextResponse } from "next/server";
import {
  getSettingsForUser,
  updateSettingsForUser,
  rotateApiKeyForUser,
  indexApiKey,
} from "@/lib/settings";
import { hasRedisEnv } from "@/lib/redis";
import { resolveSession } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function publicSettings(s: Awaited<ReturnType<typeof getSettingsForUser>>) {
  return {
    displayName: s.displayName,
    apiKey: s.apiKey,
    webhookSecret: s.webhookSecret,
    feeType: s.feeType,
    feeValue: s.feeValue,
    feeMin: s.feeMin ?? 1,
    feeMax: s.feeMax ?? 99,
    defaultExpiryMinutes: s.defaultExpiryMinutes,
    enabledMerchants: s.enabledMerchants ?? [],
    hasPassword: false,
    updatedAt: s.updatedAt,
  };
}

async function requireUser(req: NextRequest) {
  const session = await resolveSession(req);
  if (!session) return null;
  return session;
}

export async function GET(req: NextRequest) {
  if (!hasRedisEnv()) {
    return NextResponse.json({ error: "Redis not configured" }, { status: 503 });
  }
  const session = await requireUser(req);
  if (!session) {
    return NextResponse.json({ error: "Belum login" }, { status: 401 });
  }
  const s = await getSettingsForUser(session.userId);
  if (s.apiKey) {
    await indexApiKey(session.userId, s.apiKey).catch(() => {});
  }
  return NextResponse.json({ settings: publicSettings(s) });
}

export async function POST(req: NextRequest) {
  if (!hasRedisEnv()) {
    return NextResponse.json({ error: "Redis not configured" }, { status: 503 });
  }
  const session = await requireUser(req);
  if (!session) {
    return NextResponse.json({ error: "Belum login" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const action = String(body.action || "update");
  const userId = session.userId;

  if (action === "rotate_api_key") {
    const s = await rotateApiKeyForUser(userId);
    await indexApiKey(userId, s.apiKey);
    return NextResponse.json({ ok: true, apiKey: s.apiKey });
  }

  if (action === "set_password" || action === "clear_password") {
    return NextResponse.json({
      ok: true,
      message: "Gunakan halaman Profil untuk mengatur password",
    });
  }

  const patch: Record<string, unknown> = {};
  if (body.displayName != null) patch.displayName = String(body.displayName);
  if (body.webhookSecret != null)
    patch.webhookSecret = String(body.webhookSecret);
  if (body.feeType != null) patch.feeType = String(body.feeType);
  if (body.feeValue != null) patch.feeValue = Number(body.feeValue);
  if (body.feeMin != null) patch.feeMin = Number(body.feeMin);
  if (body.feeMax != null) patch.feeMax = Number(body.feeMax);
  if (body.defaultExpiryMinutes != null)
    patch.defaultExpiryMinutes = Number(body.defaultExpiryMinutes);
  if (Array.isArray(body.enabledMerchants)) {
    patch.enabledMerchants = body.enabledMerchants.map(String);
  }

  const s = await updateSettingsForUser(
    userId,
    patch as Parameters<typeof updateSettingsForUser>[1]
  );
  if (s.apiKey) await indexApiKey(userId, s.apiKey).catch(() => {});
  return NextResponse.json({ ok: true, settings: publicSettings(s) });
}

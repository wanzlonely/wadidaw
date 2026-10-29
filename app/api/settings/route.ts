import { NextRequest, NextResponse } from "next/server";
import {
  getSettings,
  updateSettings,
  rotateApiKey,
  hashPassword,
} from "@/lib/settings";
import { hasRedisEnv } from "@/lib/redis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function publicSettings(s: Awaited<ReturnType<typeof getSettings>>) {
  return {
    displayName: s.displayName,
    apiKey: s.apiKey,
    webhookSecret: s.webhookSecret,
    feeType: s.feeType,
    feeValue: s.feeValue,
    defaultExpiryMinutes: s.defaultExpiryMinutes,
    enabledMerchants: s.enabledMerchants ?? [],
    hasPassword: Boolean(s.passwordHash),
    updatedAt: s.updatedAt,
  };
}

export async function GET() {
  if (!hasRedisEnv()) {
    return NextResponse.json({ error: "Redis not configured" }, { status: 503 });
  }
  const s = await getSettings();
  return NextResponse.json({ settings: publicSettings(s) });
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

  const action = String(body.action || "update");

  if (action === "rotate_api_key") {
    const s = await rotateApiKey();
    return NextResponse.json({ ok: true, apiKey: s.apiKey });
  }

  if (action === "set_password") {
    const pw = String(body.password || "");
    if (pw.length < 6) {
      return NextResponse.json(
        { error: "Password minimal 6 karakter" },
        { status: 400 }
      );
    }
    const passwordHash = await hashPassword(pw);
    await updateSettings({ passwordHash });
    return NextResponse.json({ ok: true });
  }

  if (action === "clear_password") {
    await updateSettings({ passwordHash: null });
    return NextResponse.json({ ok: true });
  }

  const patch: Record<string, unknown> = {};
  if (body.displayName != null) patch.displayName = String(body.displayName);
  if (body.webhookSecret != null)
    patch.webhookSecret = String(body.webhookSecret);
  if (body.feeType != null) patch.feeType = String(body.feeType);
  if (body.feeValue != null) patch.feeValue = Number(body.feeValue);
  if (body.defaultExpiryMinutes != null)
    patch.defaultExpiryMinutes = Number(body.defaultExpiryMinutes);
  if (Array.isArray(body.enabledMerchants)) {
    patch.enabledMerchants = body.enabledMerchants.map(String);
  }

  const s = await updateSettings(patch as Parameters<typeof updateSettings>[0]);
  return NextResponse.json({ ok: true, settings: publicSettings(s) });
}

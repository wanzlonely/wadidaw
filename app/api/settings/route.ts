import { NextRequest, NextResponse } from "next/server";
import {
  getSettings,
  updateSettings,
  rotateApiKey,
} from "@/lib/settings";
import { hasRedisEnv } from "@/lib/redis";
import { requireUser } from "@/lib/api-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function publicSettings(s: Awaited<ReturnType<typeof getSettings>>) {
  return {
    displayName: s.displayName,
    apiKey: s.apiKey,
    webhookSecret: s.webhookSecret,
    feeType: "random" as const,
    feeValue: s.feeValue,
    feeMin: (s as { feeMin?: number }).feeMin ?? 1,
    feeMax: (s as { feeMax?: number }).feeMax ?? 99,
    defaultExpiryMinutes: s.defaultExpiryMinutes,
    enabledMerchants: s.enabledMerchants ?? [],
    updatedAt: s.updatedAt,
  };
}

export async function GET(req: NextRequest) {
  if (!hasRedisEnv()) {
    return NextResponse.json({ error: "Redis not configured" }, { status: 503 });
  }
  const auth = await requireUser(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const s = await getSettings();
  return NextResponse.json({ settings: publicSettings(s) });
}

export async function POST(req: NextRequest) {
  if (!hasRedisEnv()) {
    return NextResponse.json({ error: "Redis not configured" }, { status: 503 });
  }
  const auth = await requireUser(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
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

  const patch: Record<string, unknown> = {
    feeType: "random",
  };
  if (body.displayName != null) patch.displayName = String(body.displayName);
  if (body.webhookSecret != null)
    patch.webhookSecret = String(body.webhookSecret);
  if (body.feeValue != null) patch.feeValue = Number(body.feeValue);
  if (body.feeMin != null) (patch as { feeMin?: number }).feeMin = Number(body.feeMin);
  if (body.feeMax != null) (patch as { feeMax?: number }).feeMax = Number(body.feeMax);
  if (body.defaultExpiryMinutes != null)
    patch.defaultExpiryMinutes = Number(body.defaultExpiryMinutes);
  if (Array.isArray(body.enabledMerchants)) {
    patch.enabledMerchants = body.enabledMerchants.map(String);
  }

  const s = await updateSettings(patch as Parameters<typeof updateSettings>[0]);
  return NextResponse.json({ ok: true, settings: publicSettings(s) });
}

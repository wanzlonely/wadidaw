import { NextRequest, NextResponse } from "next/server";
import { getServiceActive, setServiceActive } from "@/lib/store";
import { hasRedisEnv } from "@/lib/redis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!hasRedisEnv()) {
    return NextResponse.json({ active: false, error: "Redis not configured" }, { status: 503 });
  }
  return NextResponse.json({ active: await getServiceActive() });
}

export async function POST(req: NextRequest) {
  if (!hasRedisEnv()) {
    return NextResponse.json({ error: "Redis not configured" }, { status: 503 });
  }
  const body = await req.json().catch(() => ({}));
  await setServiceActive(Boolean(body.active));
  return NextResponse.json({ ok: true, active: await getServiceActive() });
}

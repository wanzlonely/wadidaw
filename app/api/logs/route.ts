import { NextResponse } from "next/server";
import { listLogs, clearLogs } from "@/lib/store";
import { hasRedisEnv } from "@/lib/redis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!hasRedisEnv()) {
    return NextResponse.json({ logs: [], error: "Redis not configured" }, { status: 503 });
  }
  return NextResponse.json({ logs: await listLogs() });
}

export async function DELETE() {
  if (!hasRedisEnv()) {
    return NextResponse.json({ error: "Redis not configured" }, { status: 503 });
  }
  await clearLogs();
  return NextResponse.json({ ok: true });
}

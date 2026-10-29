import { NextRequest, NextResponse } from "next/server";
import { listPayments, clearPayments, getStats } from "@/lib/store";
import { hasRedisEnv } from "@/lib/redis";
import { requireUser } from "@/lib/api-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!hasRedisEnv()) {
    return NextResponse.json(
      { error: "Redis not configured", payments: [], stats: null },
      { status: 503 }
    );
  }
  const auth = await requireUser(req);
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.error, payments: [], stats: null },
      { status: auth.status }
    );
  }
  const [payments, stats] = await Promise.all([listPayments(), getStats()]);
  return NextResponse.json({ payments, stats });
}

export async function DELETE(req: NextRequest) {
  if (!hasRedisEnv()) {
    return NextResponse.json({ error: "Redis not configured" }, { status: 503 });
  }
  const auth = await requireUser(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  await clearPayments();
  return NextResponse.json({ ok: true });
}

import { NextRequest, NextResponse } from "next/server";
import { listPayments, clearPayments, getStats } from "@/lib/store";
import { hasRedisEnv } from "@/lib/redis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!hasRedisEnv()) {
    return NextResponse.json(
      { error: "Redis not configured", payments: [], stats: null },
      { status: 503 }
    );
  }
  const [payments, stats] = await Promise.all([listPayments(), getStats()]);
  return NextResponse.json({ payments, stats });
}

export async function DELETE(req: NextRequest) {
  if (!hasRedisEnv()) {
    return NextResponse.json({ error: "Redis not configured" }, { status: 503 });
  }
  const secret = process.env.WEBHOOK_SECRET;
  if (secret && req.headers.get("x-walzpay-secret") !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await clearPayments();
  return NextResponse.json({ ok: true });
}

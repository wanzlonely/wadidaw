import { NextResponse } from "next/server";
import { listPayments } from "@/lib/store";
import { hasRedisEnv } from "@/lib/redis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!hasRedisEnv()) {
    return NextResponse.json({ error: "Redis not configured", days: [] }, { status: 503 });
  }

  const payments = await listPayments();
  const days: { key: string; label: string; count: number; amount: number }[] = [];
  const now = new Date();

  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    const key = d.toDateString();
    const label = d.toLocaleDateString("id-ID", { weekday: "short" });
    const subset = payments.filter((p) => new Date(p.receivedAt).toDateString() === key);
    days.push({
      key,
      label,
      count: subset.length,
      amount: subset.reduce((s, p) => s + p.amount, 0),
    });
  }

  return NextResponse.json({ days });
}

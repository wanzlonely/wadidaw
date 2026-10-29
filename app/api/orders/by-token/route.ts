import { NextRequest, NextResponse } from "next/server";
import { getOrderByToken } from "@/lib/store";
import { hasRedisEnv } from "@/lib/redis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!hasRedisEnv()) {
    return NextResponse.json({ error: "Redis not configured" }, { status: 503 });
  }
  const token = req.nextUrl.searchParams.get("token");
  if (!token) {
    return NextResponse.json({ error: "token required" }, { status: 400 });
  }
  const order = await getOrderByToken(token);
  if (!order) {
    return NextResponse.json({ error: "Pesanan tidak ditemukan" }, { status: 404 });
  }
  // Public payload only — no internal ids beyond what's needed
  return NextResponse.json({
    order: {
      id: order.id,
      amount: order.amount,
      uniqueCode: order.uniqueCode,
      totalAmount: order.totalAmount,
      token: order.token,
      reference: order.reference,
      customerName: order.customerName,
      note: order.note,
      status: order.status,
      createdAt: order.createdAt,
      paidAt: order.paidAt,
      expiresAt: order.expiresAt,
      mode: order.mode,
    },
  });
}

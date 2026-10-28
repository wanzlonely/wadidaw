import { NextRequest, NextResponse } from "next/server";
import { listPayments, clearPayments, getStats } from "@/lib/store";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    payments: listPayments(),
    stats: getStats(),
  });
}

export async function DELETE(req: NextRequest) {
  const secret = process.env.WEBHOOK_SECRET;
  if (secret) {
    const header = req.headers.get("x-walzpay-secret");
    if (header !== secret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }
  clearPayments();
  return NextResponse.json({ ok: true });
}

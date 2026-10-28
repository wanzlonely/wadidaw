import { NextRequest, NextResponse } from "next/server";
import { addPayment, forwardPayment, getServiceActive } from "@/lib/store";

export const runtime = "nodejs";

/** Simulasi pembayaran untuk uji dashboard tanpa HP */
export async function POST(req: NextRequest) {
  if (!getServiceActive()) {
    return NextResponse.json({ error: "Service paused" }, { status: 503 });
  }
  const body = await req.json().catch(() => ({}));
  const amount = Number(body.amount) || 10000;
  const merchantId = String(body.merchantId ?? "dana");

  const row = addPayment({
    merchantId,
    amount,
    paymentSource: String(body.paymentSource ?? "TEST"),
    senderName: body.senderName ? String(body.senderName) : "Tester",
    rawTitle: "Simulasi WALZPAY",
    rawText: `Rp${amount.toLocaleString("id-ID")}`,
    packageName: "walzpay.test",
  });

  await forwardPayment(row);
  return NextResponse.json({ ok: true, payment: row });
}

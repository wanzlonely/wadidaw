import { NextRequest, NextResponse } from "next/server";
import { addPayment } from "@/lib/store";

export const runtime = "nodejs";

function extractAmount(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const digits = value.replace(/\D/g, "");
    const n = Number(digits);
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  return null;
}

export async function POST(req: NextRequest) {
  const secret = process.env.WEBHOOK_SECRET;
  if (secret) {
    const header = req.headers.get("x-walzpay-secret");
    if (header !== secret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  let amount =
    extractAmount(body.amount) ?? extractAmount(body.nominal) ?? null;

  if (amount == null && typeof body.rawText === "string") {
    const m = body.rawText.match(/rp\.?\s*[\d.]+/i);
    if (m) amount = extractAmount(m[0]);
  }

  if (amount == null || amount <= 0) {
    return NextResponse.json(
      { error: "amount required (number or Rp string)" },
      { status: 400 }
    );
  }

  const row = addPayment({
    merchantId: String(body.merchantId ?? body.merchant ?? "unknown"),
    amount,
    paymentSource:
      body.paymentSource != null ? String(body.paymentSource) : null,
    senderName: body.senderName != null ? String(body.senderName) : null,
    rawTitle: body.rawTitle != null ? String(body.rawTitle) : null,
    rawText: body.rawText != null ? String(body.rawText) : null,
  });

  return NextResponse.json({ ok: true, payment: row });
}

export async function GET() {
  return NextResponse.json({
    service: "WALZPAY webhook",
    method: "POST JSON to this URL from your phone listener app",
    example: {
      merchantId: "dana",
      amount: 10000,
      paymentSource: "DANA",
      rawTitle: "Pembayaran berhasil",
      rawText: "Rp10.000",
    },
  });
}

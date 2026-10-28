import { NextRequest, NextResponse } from "next/server";
import {
  addPayment,
  addLog,
  forwardPayment,
  getServiceActive,
} from "@/lib/store";

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
      addLog("warn", "Webhook rejected: bad secret");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  if (!getServiceActive()) {
    addLog("warn", "Webhook ignored: service paused");
    return NextResponse.json(
      { error: "Service paused", ok: false },
      { status: 503 }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  addLog("info", "Webhook received", body);

  let amount =
    extractAmount(body.amount) ?? extractAmount(body.nominal) ?? null;

  if (amount == null && typeof body.rawText === "string") {
    const m = body.rawText.match(/rp\.?\s*[\d.]+/i);
    if (m) amount = extractAmount(m[0]);
  }
  if (amount == null && typeof body.text === "string") {
    const m = body.text.match(/rp\.?\s*[\d.]+/i);
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
      body.paymentSource != null
        ? String(body.paymentSource)
        : body.source != null
          ? String(body.source)
          : null,
    senderName: body.senderName != null ? String(body.senderName) : null,
    rawTitle:
      body.rawTitle != null
        ? String(body.rawTitle)
        : body.title != null
          ? String(body.title)
          : null,
    rawText:
      body.rawText != null
        ? String(body.rawText)
        : body.text != null
          ? String(body.text)
          : null,
    packageName: body.packageName != null ? String(body.packageName) : null,
  });

  await forwardPayment(row);

  return NextResponse.json({ ok: true, payment: row });
}

export async function GET() {
  return NextResponse.json({
    service: "WALZPAY webhook",
    active: getServiceActive(),
    method: "POST JSON from phone listener (e.g. QRIS Hook)",
    example: {
      merchantId: "dana",
      amount: 10000,
      paymentSource: "DANA",
      packageName: "id.dana",
      rawTitle: "Pembayaran berhasil",
      rawText: "Rp10.000",
    },
  });
}

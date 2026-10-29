import { NextRequest, NextResponse } from "next/server";
import {
  addPayment,
  attachMatchedOrder,
  forwardPayment,
  getServiceActive,
  matchPendingOrder,
} from "@/lib/store";
import { parsePaymentBody } from "@/lib/parse-payment";
import { hasRedisEnv } from "@/lib/redis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Simulasi: default | whatsapp | dana */
export async function POST(req: NextRequest) {
  if (!hasRedisEnv()) {
    return NextResponse.json({ error: "Redis not configured" }, { status: 503 });
  }
  if (!(await getServiceActive())) {
    return NextResponse.json({ error: "Service paused" }, { status: 503 });
  }

  const body = await req.json().catch(() => ({}));
  const kind = String(body.kind ?? "default");
  const amount = Number(body.amount) || 25000;

  let sample: Record<string, unknown>;

  if (kind === "whatsapp") {
    sample = {
      packageName: "com.whatsapp",
      merchantId: "whatsapp",
      rawTitle: "BCA",
      rawText: `Transfer masuk Rp${amount.toLocaleString("id-ID")} dari BUDI SANTOSO. Saldo tersedia.`,
      paymentSource: "WhatsApp",
      senderName: "BUDI SANTOSO",
      amount,
    };
  } else if (kind === "dana") {
    sample = {
      packageName: "id.dana",
      merchantId: "dana",
      source_package: "id.dana",
      payment: { amount, currency: "IDR", payment_source: "DANA" },
      notification: {
        title: "Pembayaran berhasil",
        text: `Rp${amount.toLocaleString("id-ID")} diterima`,
        source_package: "id.dana",
      },
    };
  } else {
    sample = {
      merchantId: String(body.merchantId ?? "dana"),
      amount,
      paymentSource: "TEST",
      senderName: "Tester",
      rawTitle: "Simulasi WALZPAY",
      rawText: `Rp${amount.toLocaleString("id-ID")}`,
      packageName: "walzpay.test",
    };
  }

  const parsed = parsePaymentBody(sample);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error, sample }, { status: 422 });
  }

  const row = await addPayment(parsed.data);
  const matched = await matchPendingOrder(row.amount, row.id);
  if (matched) await attachMatchedOrder(row.id, matched.id);
  await forwardPayment(row);

  return NextResponse.json({ ok: true, kind, payment: row, matchedOrder: matched });
}

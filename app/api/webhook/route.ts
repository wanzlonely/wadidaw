import { NextRequest, NextResponse } from "next/server";
import {
  addPayment,
  addLog,
  forwardPayment,
  getServiceActive,
} from "@/lib/store";
import { parsePaymentBody } from "@/lib/parse-payment";
import { hasRedisEnv } from "@/lib/redis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

function checkSecret(req: NextRequest) {
  const secret = process.env.WEBHOOK_SECRET;
  if (!secret) return true;
  return req.headers.get("x-walzpay-secret") === secret;
}

export async function POST(req: NextRequest) {
  const started = Date.now();

  if (!hasRedisEnv()) {
    return NextResponse.json(
      {
        error:
          "Upstash Redis not configured. Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN.",
      },
      { status: 503 }
    );
  }

  if (!checkSecret(req)) {
    await addLog("warn", "Webhook rejected: bad secret");
    return unauthorized();
  }

  try {
    if (!(await getServiceActive())) {
      await addLog("warn", "Webhook ignored: service paused");
      return NextResponse.json(
        { ok: false, error: "Service paused" },
        { status: 503 }
      );
    }

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    await addLog("info", "Webhook received", body);

    const parsed = parsePaymentBody(body);
    if (!parsed.ok) {
      await addLog("warn", `Parse rejected: ${parsed.error}`, body);
      return NextResponse.json(
        { ok: false, error: parsed.error },
        { status: 422 }
      );
    }

    const row = await addPayment(parsed.data);
    // Fire-and-forget style but await for reliability on serverless
    await forwardPayment(row);

    return NextResponse.json({
      ok: true,
      payment: row,
      ms: Date.now() - started,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    try {
      await addLog("error", "Webhook handler error", msg);
    } catch {
      /* ignore */
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    service: "WALZPAY webhook",
    redis: hasRedisEnv(),
    method: "POST JSON from phone listener (QRIS Hook)",
    headers: process.env.WEBHOOK_SECRET
      ? { "x-walzpay-secret": "required" }
      : undefined,
    example: {
      merchantId: "dana",
      amount: 10000,
      packageName: "id.dana",
      rawTitle: "Pembayaran berhasil",
      rawText: "Rp10.000",
    },
  });
}

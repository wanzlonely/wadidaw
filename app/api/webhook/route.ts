import { NextRequest, NextResponse } from "next/server";
import {
  addPayment,
  addLog,
  forwardPayment,
  getServiceActive,
  isDuplicatePayment,
  matchPendingOrder,
  attachMatchedOrder,
} from "@/lib/store";
import { parsePaymentBody } from "@/lib/parse-payment";
import { hasRedisEnv } from "@/lib/redis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function checkSecret(req: NextRequest) {
  const secret = process.env.WEBHOOK_SECRET;
  if (!secret) return true;
  const h =
    req.headers.get("x-walzpay-secret") ||
    req.headers.get("x-webhook-secret");
  return h === secret;
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
    try {
      await addLog("warn", "Webhook rejected: bad secret");
    } catch {
      /* ignore */
    }
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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

    // Dedup: same amount + package within ~2 menit
    if (await isDuplicatePayment(parsed.data.amount, parsed.data.packageName)) {
      await addLog("warn", `Duplicate skipped Rp${parsed.data.amount}`, {
        packageName: parsed.data.packageName,
      });
      return NextResponse.json({
        ok: true,
        duplicate: true,
        ms: Date.now() - started,
      });
    }

    const row = await addPayment(parsed.data);

    // Auto-match pending order dengan nominal sama
    const matched = await matchPendingOrder(row.amount, row.id);
    if (matched) {
      await attachMatchedOrder(row.id, matched.id);
    }

    await forwardPayment(row);

    return NextResponse.json({
      ok: true,
      payment: row,
      matchedOrder: matched,
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
    method: "POST JSON from android-listener / QRIS Hook",
    features: ["parse", "dedup", "match pending order", "forward"],
    secretHeaders: ["x-webhook-secret", "x-walzpay-secret"],
  });
}

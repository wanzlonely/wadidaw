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
import { findUserIdByApiKey } from "@/lib/settings";
import { setTenant } from "@/lib/tenant";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function resolveAuth(req: NextRequest): Promise<{
  ok: boolean;
  userId: string | null;
}> {
  const apiKey =
    req.headers.get("x-api-key") ||
    req.headers.get("x-walzpay-key") ||
    "";
  if (apiKey) {
    const uid = await findUserIdByApiKey(apiKey.trim());
    if (uid) return { ok: true, userId: uid };
  }

  const secret = process.env.WEBHOOK_SECRET;
  if (secret) {
    const h =
      req.headers.get("x-walzpay-secret") ||
      req.headers.get("x-webhook-secret");
    if (h === secret) return { ok: true, userId: null };
    if (apiKey) return { ok: false, userId: null };
    return { ok: false, userId: null };
  }

  if (apiKey) return { ok: false, userId: null };
  return { ok: true, userId: null };
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

  const auth = await resolveAuth(req);
  if (!auth.ok) {
    try {
      await addLog("warn", "Webhook rejected: bad secret/api key");
    } catch {
      /* ignore */
    }
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Scope all store operations to this tenant when API key resolved a user
  if (auth.userId) {
    setTenant(auth.userId);
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

    await addLog("info", "Webhook received", {
      ...body,
      _userId: auth.userId,
    });

    const parsed = parsePaymentBody(body);
    if (!parsed.ok) {
      await addLog("warn", `Parse rejected: ${parsed.error}`, body);
      return NextResponse.json(
        { ok: false, error: parsed.error },
        { status: 422 }
      );
    }

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

    const row = await addPayment({
      ...parsed.data,
    });

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
    features: ["parse", "dedup", "match pending order", "forward", "multi-tenant api key"],
    secretHeaders: ["x-webhook-secret", "x-walzpay-secret"],
    apiKeyHeaders: ["x-api-key", "x-walzpay-key"],
  });
}

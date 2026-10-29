import { NextRequest, NextResponse } from "next/server";
import { createOrder, listOrders, cancelOrder, sweepExpiredOrders } from "@/lib/store";
import { getStaticQris } from "@/lib/static-qris";
import { convertStaticToDynamic, computeAdminFee } from "@/lib/qris-convert";
import { getSettingsForUser } from "@/lib/settings";
import { getRedis, hasRedisEnv, KEYS } from "@/lib/redis";
import { resolveSession } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!hasRedisEnv()) {
    return NextResponse.json(
      { error: "Redis not configured", orders: [] },
      { status: 503 }
    );
  }
  const session = await resolveSession(req);
  if (!session) {
    return NextResponse.json({ error: "Belum login", orders: [] }, { status: 401 });
  }
  const status = req.nextUrl.searchParams.get("status") as
    | "pending"
    | "success"
    | "expired"
    | "cancelled"
    | null;
  const orders = await listOrders(status || undefined, session.userId);
  return NextResponse.json({ orders });
}

export async function POST(req: NextRequest) {
  if (!hasRedisEnv()) {
    return NextResponse.json({ error: "Redis not configured" }, { status: 503 });
  }

  const session = await resolveSession(req);
  if (!session) {
    return NextResponse.json({ error: "Belum login" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json(
      { error: "amount wajib (angka > 0)" },
      { status: 400 }
    );
  }

  try {
    const settings = await getSettingsForUser(session.userId);

    let adminFee = 0;
    if (body.adminFee != null && Number.isFinite(Number(body.adminFee))) {
      adminFee = Math.max(0, Math.round(Number(body.adminFee)));
    } else if (settings.feeType === "fixed") {
      adminFee = computeAdminFee(amount, {
        type: "fixed",
        value: settings.feeValue,
      });
    } else if (settings.feeType === "percent") {
      adminFee = computeAdminFee(amount, {
        type: "percent",
        value: settings.feeValue,
      });
    }

    const expiresInMinutes =
      body.expiresInMinutes != null
        ? Number(body.expiresInMinutes)
        : settings.defaultExpiryMinutes || 15;

    const order = await createOrder({
      amount,
      reference: body.reference != null ? String(body.reference) : null,
      customerName: body.customerName != null ? String(body.customerName) : null,
      note: body.note != null ? String(body.note) : null,
      expiresInMinutes,
      dynamic: body.dynamic === false ? false : true,
      adminFee,
      minFee: settings.feeMin,
      maxFee: settings.feeMax,
      userId: session.userId,
    });

    const qrisStaticId =
      body.qrisStaticId != null ? String(body.qrisStaticId) : null;
    if (qrisStaticId) {
      const tpl = await getStaticQris(qrisStaticId);
      if (!tpl) {
        return NextResponse.json(
          { error: "Template QRIS tidak ditemukan" },
          { status: 400 }
        );
      }
      const dynamicQris = convertStaticToDynamic(
        tpl.qrisString,
        order.totalAmount,
        null
      );
      const redis = getRedis();
      const raw = await redis.lrange(KEYS.orders, 0, 49);
      for (let i = 0; i < raw.length; i++) {
        const item =
          typeof raw[i] === "string" ? JSON.parse(raw[i] as string) : raw[i];
        if (item.id === order.id) {
          item.qrisStaticId = qrisStaticId;
          item.dynamicQris = dynamicQris;
          await redis.lset(KEYS.orders, i, JSON.stringify(item));
          (order as { qrisStaticId?: string }).qrisStaticId = qrisStaticId;
          (order as { dynamicQris?: string }).dynamicQris = dynamicQris;
          break;
        }
      }
    }

    return NextResponse.json({ ok: true, order }, { status: 201 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 400 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  if (!hasRedisEnv()) {
    return NextResponse.json({ error: "Redis not configured" }, { status: 503 });
  }
  if (req.nextUrl.searchParams.get("all") === "1" || req.nextUrl.searchParams.get("purge") === "1") {
    await sweepExpiredOrders();
    return NextResponse.json({ ok: true, note: "sweep expired only" });
  }
  const id = req.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }
  const order = await cancelOrder(id);
  if (!order) {
    return NextResponse.json(
      { error: "Order not found or not pending" },
      { status: 404 }
    );
  }
  return NextResponse.json({ ok: true, order });
}

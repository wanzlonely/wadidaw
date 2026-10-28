import { NextRequest, NextResponse } from "next/server";
import {
  listForwards,
  addForward,
  removeForward,
  setForwardEnabled,
} from "@/lib/store";
import { hasRedisEnv } from "@/lib/redis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function needRedis() {
  if (!hasRedisEnv()) {
    return NextResponse.json({ error: "Redis not configured" }, { status: 503 });
  }
  return null;
}

export async function GET() {
  const err = needRedis();
  if (err) return err;
  return NextResponse.json({ forwards: await listForwards() });
}

export async function POST(req: NextRequest) {
  const err = needRedis();
  if (err) return err;
  const body = await req.json().catch(() => ({}));
  const url = String(body.url ?? "").trim();
  if (!/^https?:\/\//i.test(url)) {
    return NextResponse.json({ error: "URL harus http/https" }, { status: 400 });
  }
  const row = await addForward(url);
  return NextResponse.json({ ok: true, forward: row });
}

export async function PATCH(req: NextRequest) {
  const err = needRedis();
  if (err) return err;
  const body = await req.json().catch(() => ({}));
  const id = String(body.id ?? "");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await setForwardEnabled(id, Boolean(body.enabled));
  return NextResponse.json({ ok: true, forwards: await listForwards() });
}

export async function DELETE(req: NextRequest) {
  const err = needRedis();
  if (err) return err;
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await removeForward(id);
  return NextResponse.json({ ok: true, forwards: await listForwards() });
}

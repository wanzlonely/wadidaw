import { NextRequest, NextResponse } from "next/server";
import {
  listStaticQris,
  addStaticQris,
  removeStaticQris,
  updateStaticQrisPackage,
} from "@/lib/static-qris";
import { hasRedisEnv } from "@/lib/redis";
import { requireUser } from "@/lib/api-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!hasRedisEnv()) {
    return NextResponse.json(
      { error: "Redis not configured", items: [] },
      { status: 503 }
    );
  }
  const auth = await requireUser(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error, items: [] }, { status: auth.status });
  }
  const items = await listStaticQris();
  return NextResponse.json({ items, max: 3 });
}

export async function POST(req: NextRequest) {
  if (!hasRedisEnv()) {
    return NextResponse.json({ error: "Redis not configured" }, { status: 503 });
  }
  const auth = await requireUser(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const qrisString = String(body.qrisString || "").trim();
  if (!qrisString) {
    return NextResponse.json(
      { error: "qrisString wajib (paste hasil scan QRIS statis)" },
      { status: 400 }
    );
  }

  try {
    const item = await addStaticQris({
      qrisString,
      label: body.label != null ? String(body.label) : null,
      packageHint:
        body.packageHint != null ? String(body.packageHint) : null,
    });
    return NextResponse.json({ ok: true, item }, { status: 201 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 400 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  if (!hasRedisEnv()) {
    return NextResponse.json({ error: "Redis not configured" }, { status: 503 });
  }
  const auth = await requireUser(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const id = String(body.id || "");
  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }
  const item = await updateStaticQrisPackage(
    id,
    body.packageHint != null ? String(body.packageHint) : null
  );
  if (!item) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, item });
}

export async function DELETE(req: NextRequest) {
  if (!hasRedisEnv()) {
    return NextResponse.json({ error: "Redis not configured" }, { status: 503 });
  }
  const auth = await requireUser(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const id = req.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }
  const ok = await removeStaticQris(id);
  if (!ok) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}

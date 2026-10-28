import { NextRequest, NextResponse } from "next/server";
import {
  listForwards,
  addForward,
  removeForward,
  setForwardEnabled,
} from "@/lib/store";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ forwards: listForwards() });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const url = String(body.url ?? "").trim();
  if (!/^https?:\/\//i.test(url)) {
    return NextResponse.json({ error: "URL harus http/https" }, { status: 400 });
  }
  const row = addForward(url);
  return NextResponse.json({ ok: true, forward: row });
}

export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const id = String(body.id ?? "");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  setForwardEnabled(id, Boolean(body.enabled));
  return NextResponse.json({ ok: true, forwards: listForwards() });
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  removeForward(id);
  return NextResponse.json({ ok: true, forwards: listForwards() });
}

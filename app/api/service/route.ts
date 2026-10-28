import { NextRequest, NextResponse } from "next/server";
import { getServiceActive, setServiceActive } from "@/lib/store";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ active: getServiceActive() });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const active = Boolean(body.active);
  setServiceActive(active);
  return NextResponse.json({ ok: true, active: getServiceActive() });
}

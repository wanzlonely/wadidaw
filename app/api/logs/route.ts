import { NextResponse } from "next/server";
import { listLogs, clearLogs } from "@/lib/store";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ logs: listLogs() });
}

export async function DELETE() {
  clearLogs();
  return NextResponse.json({ ok: true });
}

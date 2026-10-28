import { NextResponse } from "next/server";
import { listPayments } from "@/lib/store";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ payments: listPayments() });
}

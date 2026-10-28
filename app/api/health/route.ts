import { NextResponse } from "next/server";
import { getRedis, hasRedisEnv } from "@/lib/redis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!hasRedisEnv()) {
    return NextResponse.json(
      { ok: false, redis: false, message: "Missing Upstash env" },
      { status: 503 }
    );
  }
  try {
    const redis = getRedis();
    const pong = await redis.ping();
    return NextResponse.json({ ok: true, redis: true, pong });
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        redis: false,
        error: e instanceof Error ? e.message : String(e),
      },
      { status: 500 }
    );
  }
}

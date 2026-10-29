import { NextRequest } from "next/server";
import { getLiveSnapshot } from "@/lib/store";
import { hasRedisEnv } from "@/lib/redis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Server-Sent Events for real-time dashboard updates.
 * Client connects once; server pushes snapshot every few seconds
 * and immediately after a new payment is recorded (via live key).
 */
export async function GET(req: NextRequest) {
  if (!hasRedisEnv()) {
    return new Response("Redis not configured", { status: 503 });
  }

  const encoder = new TextEncoder();
  let closed = false;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(data)}\n\n`)
          );
        } catch {
          closed = true;
        }
      };

      // Initial snapshot
      try {
        const snap = await getLiveSnapshot();
        send({ type: "snapshot", ...snap });
      } catch (e) {
        send({ type: "error", message: String(e) });
      }

      // Poll Redis every 2s for changes (Upstash has no native pub/sub over REST)
      const interval = setInterval(async () => {
        if (closed) {
          clearInterval(interval);
          return;
        }
        try {
          const snap = await getLiveSnapshot();
          send({ type: "snapshot", ...snap });
        } catch {
          /* ignore transient */
        }
      }, 2000);

      // Keep-alive comment every 15s so proxies don't drop the connection
      const keepalive = setInterval(() => {
        if (closed) {
          clearInterval(keepalive);
          return;
        }
        try {
          controller.enqueue(encoder.encode(`: keepalive\n\n`));
        } catch {
          closed = true;
        }
      }, 15_000);

      req.signal.addEventListener("abort", () => {
        closed = true;
        clearInterval(interval);
        clearInterval(keepalive);
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

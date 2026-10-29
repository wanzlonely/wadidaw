import { NextRequest } from "next/server";
import { resolveSession } from "./auth";

/**
 * Require authenticated user (cookie walz_sid OR x-walz-token header).
 * Compatible with hybrid session after cookie-based auth rewrite.
 */
export async function requireUser(req: NextRequest): Promise<
  | { ok: true; userId: string; email: string; displayName: string; sid: string }
  | { ok: false; status: number; error: string }
> {
  const session = await resolveSession(req);
  if (!session) {
    return { ok: false, status: 401, error: "Login diperlukan" };
  }
  return {
    ok: true,
    userId: session.userId,
    email: session.email,
    displayName: session.displayName,
    sid: session.sid,
  };
}

export function optionalToken(req: NextRequest): string {
  return (
    req.headers.get("x-walz-token") ||
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ||
    ""
  ).trim();
}

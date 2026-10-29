import { NextRequest } from "next/server";
import { getSession } from "./auth";
import { setTenant } from "./tenant";

export async function requireUser(req: NextRequest): Promise<
  | { ok: true; userId: string; email: string; token: string }
  | { ok: false; status: number; error: string }
> {
  const header =
    req.headers.get("x-walz-token") ||
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ||
    "";
  const token = header.trim();
  if (!token) {
    return { ok: false, status: 401, error: "Login diperlukan" };
  }
  const session = await getSession(token);
  if (!session || !session.a2fVerified) {
    return { ok: false, status: 401, error: "Sesi tidak valid atau A2F belum selesai" };
  }
  setTenant(session.userId);
  return {
    ok: true,
    userId: session.userId,
    email: session.email,
    token: session.token,
  };
}

export function optionalToken(req: NextRequest): string {
  return (
    req.headers.get("x-walz-token") ||
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ||
    ""
  ).trim();
}

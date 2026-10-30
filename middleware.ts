import { NextRequest, NextResponse } from "next/server";

/**
 * Batasi akses halaman dashboard lewat browser biasa.
 * Tetap terbuka: /api/*, /pay/*, aset statis, halaman app-only.
 * App Android (UA WalzpayApp) + cookie override diizinkan.
 */
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Publik: API, payment link, aset, halaman gate
  if (
    pathname.startsWith("/api/") ||
    pathname.startsWith("/pay/") ||
    pathname.startsWith("/_next/") ||
    pathname === "/app-only" ||
    pathname === "/favicon.ico" ||
    pathname === "/manifest.json" ||
    pathname === "/offline.html" ||
    pathname.startsWith("/icon")
  ) {
    return NextResponse.next();
  }

  const ua = req.headers.get("user-agent") || "";
  const isApp = /WalzpayApp/i.test(ua);
  const allowWeb =
    req.cookies.get("walz_web_ok")?.value === "1" ||
    process.env.ALLOW_WEB_BROWSER === "1";

  if (isApp || allowWeb) {
    return NextResponse.next();
  }

  // Browser biasa → halaman "pakai aplikasi"
  const url = req.nextUrl.clone();
  url.pathname = "/app-only";
  url.search = "";
  return NextResponse.rewrite(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};

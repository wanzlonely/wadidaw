"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

const PUBLIC = ["/login", "/pay"];

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [ready, setReady] = useState(false);
  const [ok, setOk] = useState(false);

  useEffect(() => {
    const isPublic = PUBLIC.some(
      (p) => pathname === p || pathname.startsWith(p + "/")
    );
    if (isPublic) {
      setOk(true);
      setReady(true);
      return;
    }

    const token = localStorage.getItem("walzpay_token");
    if (!token) {
      setReady(true);
      router.replace("/login");
      return;
    }

    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 8000);
    fetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "me", token }),
      signal: ctrl.signal,
    })
      .then(async (r) => {
        clearTimeout(to);
        const data = await r.json().catch(() => ({}));
        if (!r.ok || !data.ok) {
          localStorage.removeItem("walzpay_token");
          router.replace("/login");
          setReady(true);
          return;
        }
        if (data.a2fVerified === false) {
          localStorage.removeItem("walzpay_token");
          router.replace("/login");
          setReady(true);
          return;
        }
        setOk(true);
        setReady(true);
      })
      .catch(() => {
        clearTimeout(to);
        localStorage.removeItem("walzpay_token");
        router.replace("/login");
        setReady(true);
      });
  }, [pathname, router]);

  if (!ready) {
    return (
      <div className="auth-shell">
        <div className="auth-logo">
          <div className="logo-mark">W</div>
          <p className="muted" style={{ marginTop: 12 }}>
            Memeriksa sesi…
          </p>
        </div>
      </div>
    );
  }

  if (!ok) return null;
  return <>{children}</>;
}

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
      router.replace("/login");
      return;
    }

    fetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "me", token }),
    })
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok || !data.ok) {
          localStorage.removeItem("walzpay_token");
          router.replace("/login");
          return;
        }
        if (data.needA2f || data.a2fVerified === false) {
          // masih butuh A2F — biarkan di login
          if (!data.a2fVerified) {
            localStorage.removeItem("walzpay_token");
            router.replace("/login");
            return;
          }
        }
        setOk(true);
        setReady(true);
      })
      .catch(() => {
        localStorage.removeItem("walzpay_token");
        router.replace("/login");
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

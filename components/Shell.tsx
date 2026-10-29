"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Nav } from "./Nav";

/**
 * Shell = layout UI + session gate (cookie walz_sid via GET /api/auth).
 * Timeout 8s supaya tidak stuck di "Memeriksa sesi…".
 */
export function Shell({
  active,
  subtitle,
  children,
  redisOk,
}: {
  active: string;
  subtitle?: string;
  children: React.ReactNode;
  redisOk?: boolean | null;
}) {
  const pathname = usePathname();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (pathname === "/login" || pathname?.startsWith("/pay/")) {
      setReady(true);
      return;
    }

    let cancelled = false;
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 8000);

    fetch("/api/auth", { credentials: "include", signal: ctrl.signal })
      .then(async (r) => {
        clearTimeout(to);
        if (cancelled) return;
        const d = await r.json().catch(() => ({}));
        if (!r.ok || !d.authenticated) {
          window.location.replace("/login");
          return;
        }
        setReady(true);
      })
      .catch(() => {
        clearTimeout(to);
        if (!cancelled) window.location.replace("/login");
      });

    return () => {
      cancelled = true;
      clearTimeout(to);
      ctrl.abort();
    };
  }, [pathname]);

  if (!ready) {
    return (
      <main className="shell">
        <p className="muted" style={{ textAlign: "center", marginTop: 80 }}>
          Memeriksa sesi…
        </p>
      </main>
    );
  }

  return (
    <main className="shell">
      <header className="topbar">
        <div className="brand">
          <div className="logo logo-live" aria-label="WALZPAY">
            <span className="logo-text">WALZPAY</span>
            <span className="logo-shine" aria-hidden />
          </div>
          <p className="tagline">{subtitle ?? "Pembayaran otomatis"}</p>
        </div>
        {redisOk !== undefined ? (
          <div className="pill-status">
            <span
              className={`dot ${redisOk ? "on" : redisOk === false ? "off" : ""}`}
            />
            {redisOk === null ? "…" : redisOk ? "Online" : "Offline"}
          </div>
        ) : null}
      </header>
      <div className="page-enter">{children}</div>
      <Nav active={active} />
    </main>
  );
}

"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Nav } from "./Nav";

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
    fetch("/api/auth", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        if (!d.authenticated) {
          window.location.href = "/login";
        } else {
          setReady(true);
        }
      })
      .catch(() => {
        if (!cancelled) window.location.href = "/login";
      });
    return () => {
      cancelled = true;
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

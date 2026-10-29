"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { Nav } from "./Nav";
import { BubbleToasts } from "./BubbleToasts";
import { apiFetch, setStoredToken } from "@/lib/api";

/**
 * Shell = layout UI + session gate.
 * Cookie + token backup. Timeout 8s — tidak stuck di "Memeriksa sesi…".
 * Setel (pengaturan) di pojok kanan atas, bukan di bottom nav.
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

    apiFetch("/api/auth", { signal: ctrl.signal })
      .then(async (r) => {
        clearTimeout(to);
        if (cancelled) return;
        const d = await r.json().catch(() => ({}));
        if (!r.ok || !d.authenticated) {
          setStoredToken(null);
          try {
            localStorage.removeItem("walzpay_token");
          } catch {
            /* ignore */
          }
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
      <main className="shell shell-loading">
        <div className="auth-logo" style={{ marginTop: 100 }}>
          <div className="logo-mark">W</div>
          <p className="muted" style={{ marginTop: 12, textAlign: "center" }}>
            Memeriksa sesi…
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="shell">
      <BubbleToasts />
      <header className="topbar">
        <div className="brand">
          <div className="logo logo-live" aria-label="WALZPAY">
            <span className="logo-text">WALZPAY</span>
            <span className="logo-shine" aria-hidden />
          </div>
          {subtitle ? <p className="tagline">{subtitle}</p> : null}
        </div>
        <div className="topbar-actions">
          {redisOk !== undefined ? (
            <div className="pill-status">
              <span
                className={`dot ${redisOk ? "on" : redisOk === false ? "off" : ""}`}
              />
              {redisOk === null ? "…" : redisOk ? "Online" : "Offline"}
            </div>
          ) : null}
          <Link
            href="/pengaturan"
            className={`btn-icon-setel${active === "/pengaturan" ? " active" : ""}`}
            title="Pengaturan"
            aria-label="Pengaturan"
          >
            ⚙
          </Link>
        </div>
      </header>
      <div className="page-enter">{children}</div>
      <Nav active={active} />
    </main>
  );
}

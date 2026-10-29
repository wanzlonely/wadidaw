"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { Nav } from "./Nav";
import { BubbleToasts } from "./BubbleToasts";
import { apiFetch, setStoredToken } from "@/lib/api";

function IconSettings() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4" />
    </svg>
  );
}

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
        <div className="session-loader">
          <div className="session-ring" aria-hidden>
            <span />
            <span />
            <span />
          </div>
          <div className="session-mark">W</div>
          <p className="session-label">Memuat…</p>
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
            <IconSettings />
          </Link>
        </div>
      </header>
      <div className="page-enter">{children}</div>
      <Nav active={active} />
    </main>
  );
}

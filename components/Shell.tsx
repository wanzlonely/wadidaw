"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { Nav } from "./Nav";
import { BubbleToasts } from "./BubbleToasts";
import { apiFetch, setStoredToken } from "@/lib/api";

function IconSettings() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="20" height="20" aria-hidden>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
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
        <div className="boot-bg" aria-hidden>
          <span className="boot-aurora boot-aurora-a" />
          <span className="boot-aurora boot-aurora-b" />
          <span className="boot-aurora boot-aurora-c" />
          <span className="boot-grid" />
        </div>
        <div className="boot-loader" aria-busy="true" aria-label="Memuat">
          <div className="boot-core">
            <span className="boot-halo" />
            <span className="boot-ring boot-ring-outer" />
            <span className="boot-ring boot-ring-mid" />
            <span className="boot-ring boot-ring-inner" />
            <div className="boot-mark">
              <span className="boot-mark-letter">W</span>
              <span className="boot-mark-shine" />
            </div>
          </div>
          <div className="boot-brand">
            <p className="boot-title">WALZPAY</p>
            <p className="boot-sub">Menyiapkan dashboard…</p>
          </div>
          <div className="boot-track" aria-hidden>
            <span className="boot-track-fill" />
          </div>
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
      <a
        className="cs-float cs-float-icon-only"
        href="https://t.me/Nebunox"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Customer service Telegram @Nebunox"
        title="Bantuan · Telegram @Nebunox"
      >
        <span className="cs-float-ring" aria-hidden />
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="M21.5 3.5L2.5 10.5l6.5 2.5 2.5 7 3-4.5 5 3.5L21.5 3.5z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
          <path d="M9 13l9.5-7.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </a>
    </main>
  );
}

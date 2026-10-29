"use client";

import { Nav } from "./Nav";

/**
 * Shell hanya layout UI.
 * Auth dicek oleh AuthGuard di layout (localStorage token).
 * Jangan cek sesi di sini — GET /api/auth tidak ada & membuat "Memeriksa sesi" stuck.
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

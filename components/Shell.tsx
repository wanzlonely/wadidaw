import Link from "next/link";
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
        <div className="topbar-right">
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
            className={`btn-setel-float${active === "/pengaturan" ? " active" : ""}`}
            aria-label="Pengaturan"
            title="Pengaturan"
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

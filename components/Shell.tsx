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
        {redisOk !== undefined ? (
          <div className="pill-status">
            <span
              className={`dot ${redisOk ? "on" : redisOk === false ? "off" : ""}`}
            />
            {redisOk === null ? "\u2026" : redisOk ? "Online" : "Offline"}
          </div>
        ) : null}
      </header>
      <div className="page-enter">{children}</div>
      <Nav active={active} />
    </main>
  );
}

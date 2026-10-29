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
          <div className="logo">WALZPAY</div>
          <p className="tagline">{subtitle ?? "Pembayaran otomatis"}</p>
        </div>
        {redisOk !== undefined ? (
          <div className="pill-status">
            <span
              className={`dot ${redisOk ? "on" : redisOk === false ? "off" : ""}`}
            />
            {redisOk === null ? "…" : redisOk ? "Redis" : "No Redis"}
          </div>
        ) : null}
      </header>
      {children}
      <Nav active={active} />
    </main>
  );
}

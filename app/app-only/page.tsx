export const metadata = {
  title: "WALZPAY · Gunakan Aplikasi",
  description: "Buka WALZPAY lewat aplikasi resmi",
};

export default function AppOnlyPage() {
  return (
    <main
      style={{
        minHeight: "100dvh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        background: "#0B1220",
        color: "#F8FAFC",
        fontFamily: "system-ui, -apple-system, sans-serif",
        textAlign: "center",
      }}
    >
      <div
        style={{
          maxWidth: 360,
          width: "100%",
          padding: "36px 28px",
          borderRadius: 24,
          background: "linear-gradient(160deg, rgba(26,35,50,0.95), rgba(15,23,42,0.98))",
          border: "1px solid rgba(255,255,255,0.08)",
          boxShadow: "0 24px 48px rgba(0,0,0,0.45)",
        }}
      >
        <div
          style={{
            width: 72,
            height: 72,
            margin: "0 auto 20px",
            borderRadius: "50%",
            background: "rgba(59,130,246,0.15)",
            border: "1px solid rgba(59,130,246,0.3)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#60A5FA" strokeWidth="1.75">
            <rect x="5" y="2" width="14" height="20" rx="2" />
            <path d="M12 18h.01" strokeLinecap="round" />
          </svg>
        </div>
        <h1 style={{ fontSize: "1.25rem", fontWeight: 700, marginBottom: 10 }}>Gunakan aplikasi WALZPAY</h1>
        <p style={{ color: "#94A3B8", fontSize: "0.92rem", lineHeight: 1.55, marginBottom: 8 }}>
          Dashboard merchant hanya tersedia di aplikasi resmi agar lebih aman dan nyaman.
        </p>
        <p style={{ color: "#64748B", fontSize: "0.8rem", lineHeight: 1.45 }}>
          Link pembayaran pelanggan (<code style={{ color: "#93C5FD" }}>/pay/…</code>) tetap bisa dibuka di browser.
        </p>
      </div>
    </main>
  );
}

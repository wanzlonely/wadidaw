export const metadata = {
  title: "WALZPAY · Unduh Aplikasi",
  description: "Unduh aplikasi WALZPAY untuk Android",
};

const APK_ACTIONS =
  "https://github.com/wanzlonely/wadidaw/actions/workflows/build-apk.yml";

export default function AppOnlyPage() {
  return (
    <main className="dl-page">
      <div className="dl-bg" aria-hidden />
      <div className="dl-card">
        <div className="dl-logo">W</div>
        <p className="dl-kicker">Aplikasi resmi</p>
        <h1 className="dl-title">WALZPAY</h1>
        <p className="dl-sub">
          Kelola QRIS & pembayaran lebih aman di HP. Dashboard tidak dibuka di browser.
        </p>

        <a className="dl-btn" href={APK_ACTIONS} target="_blank" rel="noopener noreferrer">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 3v12" strokeLinecap="round" />
            <path d="M7 10l5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M5 19h14" strokeLinecap="round" />
          </svg>
          Unduh APK
        </a>

        <ol className="dl-steps">
          <li>Buka halaman build</li>
          <li>Pilih run terbaru yang hijau</li>
          <li>Artifacts → <strong>walzpay-apk</strong></li>
          <li>Extract ZIP → install <strong>walzpay.apk</strong></li>
        </ol>

        <p className="dl-note">Link bayar pelanggan (/pay/…) tetap bisa dibuka di browser.</p>
      </div>

      <style>{`
        .dl-page {
          min-height: 100dvh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 28px 18px;
          background: #070b16;
          color: #f8fafc;
          font-family: system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
          position: relative;
          overflow: hidden;
        }
        .dl-bg {
          position: absolute;
          inset: -20%;
          background:
            radial-gradient(ellipse 50% 40% at 30% 20%, rgba(59,130,246,0.28), transparent 60%),
            radial-gradient(ellipse 45% 35% at 80% 70%, rgba(139,92,246,0.18), transparent 55%),
            radial-gradient(ellipse 40% 30% at 50% 100%, rgba(56,189,248,0.12), transparent 50%);
          animation: dl-float 12s ease-in-out infinite alternate;
          pointer-events: none;
        }
        @keyframes dl-float {
          from { transform: translate(0,0) scale(1); }
          to { transform: translate(-2%, 3%) scale(1.05); }
        }
        .dl-card {
          position: relative;
          z-index: 1;
          width: 100%;
          max-width: 380px;
          padding: 36px 28px 28px;
          border-radius: 28px;
          text-align: center;
          background: linear-gradient(160deg, rgba(255,255,255,0.12), rgba(255,255,255,0.04));
          border: 1px solid rgba(255,255,255,0.16);
          box-shadow: 0 28px 60px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.2);
          backdrop-filter: blur(24px);
          -webkit-backdrop-filter: blur(24px);
          animation: dl-in 0.55s cubic-bezier(0.22,1,0.36,1) both;
        }
        @keyframes dl-in {
          from { opacity: 0; transform: translateY(18px) scale(0.96); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        .dl-logo {
          width: 64px;
          height: 64px;
          margin: 0 auto 16px;
          border-radius: 20px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 26px;
          font-weight: 700;
          color: #fff;
          background: linear-gradient(145deg, rgba(96,165,250,0.45), rgba(37,99,235,0.35));
          border: 1px solid rgba(147,197,253,0.4);
          box-shadow: 0 12px 32px rgba(37,99,235,0.35), 0 0 40px rgba(59,130,246,0.2);
          animation: dl-pulse 3s ease-in-out infinite;
        }
        @keyframes dl-pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.04); }
        }
        .dl-kicker {
          margin: 0 0 6px;
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: #93c5fd;
        }
        .dl-title {
          margin: 0 0 10px;
          font-size: 1.75rem;
          font-weight: 700;
          letter-spacing: -0.03em;
          background: linear-gradient(110deg, #fff 0%, #bfdbfe 50%, #93c5fd 100%);
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
        }
        .dl-sub {
          margin: 0 0 24px;
          font-size: 0.92rem;
          line-height: 1.55;
          color: #94a3b8;
        }
        .dl-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          width: 100%;
          padding: 15px 20px;
          border-radius: 16px;
          font-size: 1rem;
          font-weight: 600;
          color: #0a1220;
          text-decoration: none;
          background: linear-gradient(160deg, #ffffff 0%, #dbeafe 50%, #93c5fd 100%);
          box-shadow: 0 12px 28px rgba(59,130,246,0.35);
        }
        .dl-btn:active { transform: scale(0.97); }
        .dl-steps {
          margin: 22px 0 0;
          padding: 14px 16px 14px 32px;
          text-align: left;
          font-size: 0.82rem;
          line-height: 1.65;
          color: #94a3b8;
          background: rgba(0,0,0,0.25);
          border-radius: 14px;
          border: 1px solid rgba(255,255,255,0.08);
        }
        .dl-steps strong { color: #e2e8f0; }
        .dl-note {
          margin: 16px 0 0;
          font-size: 0.75rem;
          color: #64748b;
          line-height: 1.45;
        }
      `}</style>
    </main>
  );
}

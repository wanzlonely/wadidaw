"use client";

import { useCallback, useEffect, useState } from "react";

type Settings = {
  displayName: string;
  apiKey: string;
  hasPassword: boolean;
  updatedAt: string;
};

export function AkunClient() {
  const [s, setS] = useState<Settings | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/settings");
      const data = await res.json();
      if (!res.ok) {
        setErr(data.error || "Gagal memuat akun");
        return;
      }
      setErr(null);
      setS({
        displayName: data.settings.displayName,
        apiKey: data.settings.apiKey,
        hasPassword: data.settings.hasPassword,
        updatedAt: data.settings.updatedAt,
      });
    } catch {
      setErr("Koneksi gagal");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function copy(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      setMsg(`${label} disalin`);
      setTimeout(() => setMsg(null), 2000);
    } catch {
      /* ignore */
    }
  }

  if (!s && !err) {
    return (
      <section className="glass">
        <p className="muted">Memuat akun\u2026</p>
      </section>
    );
  }

  return (
    <>
      {err ? (
        <section className="glass anim-shake">
          <p style={{ color: "var(--rose)" }}>{err}</p>
        </section>
      ) : null}
      {msg ? (
        <div className="toast-banner anim-pop" role="status">
          {msg}
        </div>
      ) : null}

      <section className="glass account-card">
        <div className="account-avatar anim-float">
          {(s?.displayName || "W").charAt(0).toUpperCase()}
        </div>
        <h2 className="account-name">{s?.displayName || "Merchant"}</h2>
        <p className="muted" style={{ textAlign: "center" }}>
          Akun merchant WALZPAY
        </p>
        <div className="account-badge">
          {s?.hasPassword ? "Terkunci password" : "Tanpa password"}
        </div>
      </section>

      <section className="glass">
        <h2>Keamanan</h2>
        <p className="muted" style={{ marginBottom: 12 }}>
          Login, registrasi, dan autentikasi 2 faktor (A2F) akan tersedia di
          pembaruan berikutnya. Sementara ini gunakan password di halaman Setel.
        </p>
        <div className="security-row">
          <div className="security-item">
            <span className="sec-ico">\u2460</span>
            <div>
              <strong style={{ color: "var(--ink)" }}>Login & daftar</strong>
              <p className="muted" style={{ fontSize: 12 }}>
                Segera hadir
              </p>
            </div>
          </div>
          <div className="security-item">
            <span className="sec-ico">\u2461</span>
            <div>
              <strong style={{ color: "var(--ink)" }}>Autentikasi 2 faktor</strong>
              <p className="muted" style={{ fontSize: 12 }}>
                Segera hadir
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="glass">
        <h2>API key</h2>
        <p
          className="muted"
          style={{
            wordBreak: "break-all",
            fontFamily: "monospace",
            fontSize: 12,
          }}
        >
          {s?.apiKey ? `${s.apiKey.slice(0, 12)}\u2026${s.apiKey.slice(-6)}` : "\u2014"}
        </p>
        <button
          type="button"
          className="btn btn-ghost btn-block btn-press"
          style={{ marginTop: 10 }}
          onClick={() => s?.apiKey && copy(s.apiKey, "API key")}
        >
          Salin API key
        </button>
      </section>

      <section className="glass">
        <h2>Pengaturan sistem</h2>
        <p className="muted" style={{ marginBottom: 10 }}>
          QRIS, biaya admin, webhook, dan masa berlaku ada di halaman Setel.
        </p>
        <a href="/pengaturan" className="btn btn-block btn-press">
          Buka pengaturan
        </a>
      </section>
    </>
  );
}

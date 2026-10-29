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
  const [busy, setBusy] = useState(false);
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [showPw, setShowPw] = useState(false);

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

  async function setPw() {
    if (password.length < 6) {
      setErr("Password minimal 6 karakter");
      return;
    }
    if (password !== password2) {
      setErr("Konfirmasi password tidak cocok");
      return;
    }
    setBusy(true);
    setErr(null);
    const res = await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "set_password", password }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setErr(data.error || "Gagal menyimpan password");
      return;
    }
    setPassword("");
    setPassword2("");
    setMsg("Password berhasil diperbarui");
    load();
  }

  async function clearPw() {
    if (!confirm("Hapus password akun?")) return;
    setBusy(true);
    await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "clear_password" }),
    });
    setBusy(false);
    setMsg("Password dihapus");
    load();
  }

  if (!s && !err) {
    return (
      <section className="glass card-v2">
        <p className="muted">Memuat akun…</p>
      </section>
    );
  }

  return (
    <>
      {err ? (
        <section className="glass card-v2 anim-shake">
          <p style={{ color: "var(--rose)" }}>{err}</p>
        </section>
      ) : null}
      {msg ? (
        <div className="toast-banner anim-pop" role="status">
          {msg}
        </div>
      ) : null}

      <section className="glass card-v2 account-card anim-rise">
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
        {s?.updatedAt ? (
          <p className="muted" style={{ textAlign: "center", fontSize: 11, marginTop: 8 }}>
            Diperbarui {new Date(s.updatedAt).toLocaleString("id-ID")}
          </p>
        ) : null}
      </section>

      <section className="glass card-v2 anim-rise">
        <h2>Ubah password</h2>
        <p className="muted" style={{ marginBottom: 10 }}>
          {s?.hasPassword
            ? "Password aktif. Masukkan password baru untuk mengganti."
            : "Belum ada password. Buat untuk mengamankan akun."}
        </p>
        <label className="muted" style={{ display: "block", fontSize: 12 }}>
          Password baru
        </label>
        <input
          className="input"
          style={{ width: "100%", marginTop: 4 }}
          type={showPw ? "text" : "password"}
          placeholder="Minimal 6 karakter"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <label className="muted" style={{ display: "block", fontSize: 12, marginTop: 10 }}>
          Konfirmasi password
        </label>
        <input
          className="input"
          style={{ width: "100%", marginTop: 4 }}
          type={showPw ? "text" : "password"}
          placeholder="Ulangi password"
          value={password2}
          onChange={(e) => setPassword2(e.target.value)}
        />
        <label className="check-row" style={{ marginTop: 10 }}>
          <input
            type="checkbox"
            checked={showPw}
            onChange={(e) => setShowPw(e.target.checked)}
          />
          <span className="muted" style={{ fontSize: 13 }}>Tampilkan password</span>
        </label>
        <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
          <button
            type="button"
            className="btn btn-press"
            disabled={busy || password.length < 6}
            onClick={setPw}
          >
            {busy ? "Menyimpan…" : "Simpan password"}
          </button>
          {s?.hasPassword ? (
            <button
              type="button"
              className="btn btn-ghost btn-press"
              disabled={busy}
              onClick={clearPw}
            >
              Hapus password
            </button>
          ) : null}
        </div>
      </section>

      <section className="glass card-v2 anim-rise">
        <h2>Keamanan</h2>
        <p className="muted" style={{ marginBottom: 12 }}>
          Login, registrasi, dan autentikasi 2 faktor (A2F) tersedia di halaman
          masuk. Aktifkan A2F untuk perlindungan ekstra.
        </p>
        <div className="security-row">
          <div className="security-item">
            <span className="sec-ico">①</span>
            <div>
              <strong style={{ color: "var(--ink)" }}>Login & daftar</strong>
              <p className="muted" style={{ fontSize: 12 }}>
                Data real-time dari Upstash Redis
              </p>
            </div>
          </div>
          <div className="security-item">
            <span className="sec-ico">②</span>
            <div>
              <strong style={{ color: "var(--ink)" }}>Verifikasi manusia</strong>
              <p className="muted" style={{ fontSize: 12 }}>
                Deteksi perilaku bot otomatis
              </p>
            </div>
          </div>
          <div className="security-item">
            <span className="sec-ico">③</span>
            <div>
              <strong style={{ color: "var(--ink)" }}>Autentikasi 2 faktor</strong>
              <p className="muted" style={{ fontSize: 12 }}>
                Kode OTP 6 digit setelah login
              </p>
            </div>
          </div>
        </div>
        <a href="/login" className="btn btn-block btn-press" style={{ marginTop: 14 }}>
          Buka halaman login
        </a>
      </section>

      <section className="glass card-v2 anim-rise">
        <h2>API key</h2>
        <p
          className="muted"
          style={{
            wordBreak: "break-all",
            fontFamily: "monospace",
            fontSize: 12,
          }}
        >
          {s?.apiKey ? `${s.apiKey.slice(0, 12)}…${s.apiKey.slice(-6)}` : "—"}
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

      <section className="glass card-v2 anim-rise">
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

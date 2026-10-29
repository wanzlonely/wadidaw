"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/client-api";
import { pushBubble } from "@/components/BubbleToasts";

type UserInfo = {
  id: string;
  email: string;
  displayName: string;
  a2fEnabled: boolean;
  hasPassword: boolean;
  createdAt: string;
  updatedAt?: string;
};

export function AkunClient() {
  const [u, setU] = useState<UserInfo | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [oldPw, setOldPw] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [showPw, setShowPw] = useState(false);

  const load = useCallback(async () => {
    const token = localStorage.getItem("walzpay_token") || "";
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "me", token }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErr(data.error || "Gagal memuat akun");
        return;
      }
      setErr(null);
      setU(data.user);
    } catch {
      setErr("Koneksi gagal");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function setPw() {
    if (password.length < 6) {
      setErr("Password baru minimal 6 karakter");
      return;
    }
    if (password !== password2) {
      setErr("Konfirmasi password tidak cocok");
      return;
    }
    if (!oldPw) {
      setErr("Masukkan password lama");
      return;
    }
    setBusy(true);
    setErr(null);
    const token = localStorage.getItem("walzpay_token") || "";
    const res = await fetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "change_password",
        token,
        oldPassword: oldPw,
        newPassword: password,
      }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setErr(data.error || "Gagal menyimpan password");
      return;
    }
    setOldPw("");
    setPassword("");
    setPassword2("");
    pushBubble({ title: "Password diperbarui", tone: "ok" });
    load();
  }

  async function toggleA2f() {
    if (!u) return;
    setBusy(true);
    const token = localStorage.getItem("walzpay_token") || "";
    const res = await fetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: u.a2fEnabled ? "disable_a2f" : "enable_a2f",
        token,
      }),
    });
    setBusy(false);
    if (res.ok) {
      pushBubble({
        title: u.a2fEnabled ? "A2F dimatikan" : "A2F diaktifkan",
        tone: "ok",
      });
      load();
    }
  }

  function logout() {
    localStorage.removeItem("walzpay_token");
    window.location.href = "/login";
  }

  if (!u && !err) {
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

      <section className="glass card-v2 account-card anim-rise">
        <div className="account-avatar anim-float">
          {(u?.displayName || "W").charAt(0).toUpperCase()}
        </div>
        <h2 className="account-name">{u?.displayName || "Merchant"}</h2>
        <p className="muted" style={{ textAlign: "center" }}>
          {u?.email}
        </p>
        <div className="account-badge">
          {u?.hasPassword ? "Password aktif" : "Tanpa password"}
        </div>
        {u?.createdAt ? (
          <p
            className="muted"
            style={{ textAlign: "center", fontSize: 11, marginTop: 8 }}
          >
            Bergabung {new Date(u.createdAt).toLocaleDateString("id-ID")}
          </p>
        ) : null}
      </section>

      <section className="glass card-v2 anim-rise">
        <h2>Detail akun</h2>
        <div className="detail-rows">
          <div className="detail-row">
            <span className="muted">ID</span>
            <strong style={{ color: "var(--ink)", fontSize: 12 }}>
              {u?.id?.slice(0, 18)}…
            </strong>
          </div>
          <div className="detail-row">
            <span className="muted">Email</span>
            <strong style={{ color: "var(--ink)", fontSize: 13 }}>
              {u?.email}
            </strong>
          </div>
          <div className="detail-row">
            <span className="muted">Nama</span>
            <strong style={{ color: "var(--ink)", fontSize: 13 }}>
              {u?.displayName}
            </strong>
          </div>
          <div className="detail-row">
            <span className="muted">A2F</span>
            <strong style={{ color: u?.a2fEnabled ? "var(--mint)" : "var(--ink-dim)", fontSize: 13 }}>
              {u?.a2fEnabled ? "Aktif" : "Nonaktif"}
            </strong>
          </div>
        </div>
      </section>

      <section className="glass card-v2 anim-rise">
        <h2>Ubah password</h2>
        <p className="muted" style={{ marginBottom: 10 }}>
          Password akun login Anda (bukan password pengaturan sistem).
        </p>
        <label className="muted" style={{ display: "block", fontSize: 12 }}>
          Password lama
        </label>
        <input
          className="input"
          style={{ width: "100%", marginTop: 4 }}
          type={showPw ? "text" : "password"}
          value={oldPw}
          onChange={(e) => setOldPw(e.target.value)}
          placeholder="Password saat ini"
        />
        <label
          className="muted"
          style={{ display: "block", fontSize: 12, marginTop: 10 }}
        >
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
        <label
          className="muted"
          style={{ display: "block", fontSize: 12, marginTop: 10 }}
        >
          Konfirmasi password baru
        </label>
        <input
          className="input"
          style={{ width: "100%", marginTop: 4 }}
          type={showPw ? "text" : "password"}
          placeholder="Ulangi password baru"
          value={password2}
          onChange={(e) => setPassword2(e.target.value)}
        />
        <label className="check-row" style={{ marginTop: 10 }}>
          <input
            type="checkbox"
            checked={showPw}
            onChange={(e) => setShowPw(e.target.checked)}
          />
          <span className="muted" style={{ fontSize: 13 }}>
            Tampilkan password
          </span>
        </label>
        <button
          type="button"
          className="btn btn-block btn-press"
          style={{ marginTop: 12 }}
          disabled={busy || password.length < 6 || !oldPw}
          onClick={setPw}
        >
          {busy ? "Menyimpan…" : "Simpan password"}
        </button>
      </section>

      <section className="glass card-v2 anim-rise">
        <h2>Keamanan A2F</h2>
        <p className="muted" style={{ marginBottom: 12 }}>
          Autentikasi 2 faktor menambahkan kode OTP saat login.
        </p>
        <button
          type="button"
          className="btn btn-block btn-press"
          disabled={busy}
          onClick={toggleA2f}
        >
          {u?.a2fEnabled ? "Matikan A2F" : "Aktifkan A2F"}
        </button>
      </section>

      <section className="glass card-v2 anim-rise">
        <button
          type="button"
          className="btn btn-block btn-ghost btn-press"
          onClick={logout}
        >
          Keluar dari akun
        </button>
      </section>
    </>
  );
}

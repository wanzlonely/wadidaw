"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch, setStoredToken } from "@/lib/api";
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

type BusyKey = "pw" | "a2f" | "logout" | null;

export function AkunClient() {
  const [u, setU] = useState<UserInfo | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<BusyKey>(null);
  const [oldPw, setOldPw] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [showPw, setShowPw] = useState(false);

  const load = useCallback(async () => {
    try {
      const getRes = await apiFetch("/api/auth");
      const getData = await getRes.json();
      if (getRes.ok && getData.authenticated && getData.user) {
        setErr(null);
        setU({
          id: getData.user.id,
          email: getData.user.email,
          displayName: getData.user.displayName,
          a2fEnabled: Boolean(getData.user.a2fEnabled),
          hasPassword: Boolean(getData.user.hasPassword),
          createdAt: getData.user.createdAt || "",
          updatedAt: getData.user.updatedAt,
        });
        return;
      }

      const res = await apiFetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "me" }),
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

  async function setPw(e?: React.FormEvent) {
    e?.preventDefault();
    if (busy === "pw") return;

    if (!oldPw.trim()) {
      setErr("Masukkan password lama");
      pushBubble({ title: "Masukkan password lama", tone: "err" });
      return;
    }
    if (password.length < 6) {
      setErr("Password baru minimal 6 karakter");
      pushBubble({ title: "Password minimal 6 karakter", tone: "err" });
      return;
    }
    if (password !== password2) {
      setErr("Konfirmasi password tidak cocok");
      pushBubble({ title: "Konfirmasi password tidak cocok", tone: "err" });
      return;
    }
    if (oldPw === password) {
      setErr("Password baru harus berbeda");
      pushBubble({ title: "Password baru harus berbeda", tone: "err" });
      return;
    }

    setBusy("pw");
    setErr(null);
    try {
      const res = await apiFetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "change_password",
          oldPassword: oldPw,
          newPassword: password,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = data.error || "Gagal menyimpan password";
        setErr(msg);
        pushBubble({ title: msg, tone: "err" });
        return;
      }
      setOldPw("");
      setPassword("");
      setPassword2("");
      pushBubble({
        title: "Password diperbarui",
        sub: "Perubahan telah disimpan",
        tone: "ok",
      });
      load();
    } catch {
      setErr("Koneksi gagal");
      pushBubble({ title: "Koneksi gagal", tone: "err" });
    } finally {
      setBusy(null);
    }
  }

  async function toggleA2f() {
    if (!u) return;
    setBusy("a2f");
    setErr(null);
    try {
      const res = await apiFetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: u.a2fEnabled ? "disable_a2f" : "enable_a2f",
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErr(data.error || "Gagal mengubah A2F");
        pushBubble({
          title: "Gagal mengubah A2F",
          sub: data.error || "Coba lagi",
          tone: "err",
        });
        return;
      }
      pushBubble({
        title: u.a2fEnabled ? "A2F dimatikan" : "A2F diaktifkan",
        sub: "Perubahan telah disimpan",
        tone: "ok",
      });
      load();
    } catch {
      setErr("Koneksi gagal");
      pushBubble({ title: "Koneksi gagal", tone: "err" });
    } finally {
      setBusy(null);
    }
  }

  async function logout() {
    setBusy("logout");
    pushBubble({ title: "Keluar…", tone: "info" });
    try {
      await apiFetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "logout" }),
      });
    } catch {
      /* still clear client */
    }
    setStoredToken(null);
    try {
      localStorage.removeItem("walzpay_token");
    } catch {
      /* ignore */
    }
    window.location.replace("/login");
  }

  if (!u && !err) {
    return (
      <section className="glass card-v2">
        <p className="muted">Memuat akun…</p>
      </section>
    );
  }

  const initial = (u?.displayName || "W").charAt(0).toUpperCase();

  return (
    <div className="profil-v2">
      {err ? (
        <section className="glass card-v2 anim-shake">
          <p style={{ color: "var(--rose)", margin: 0 }}>⚠️ {err}</p>
        </section>
      ) : null}

      <section className="glass card-v2 profil-hero anim-rise">
        <div className="profil-avatar-wrap">
          <div className="profil-avatar">{initial}</div>
          <span className="profil-avatar-glow" aria-hidden />
        </div>
        <h2 className="profil-name">{u?.displayName || "Merchant"}</h2>
        <p className="profil-email">{u?.email || "—"}</p>
        <div className="profil-pills">
          <span className="profil-pill ok">🔐 Password aktif</span>
          <span className={`profil-pill${u?.a2fEnabled ? " ok" : ""}`}>
            {u?.a2fEnabled ? "🛡️ A2F aktif" : "🛡️ A2F off"}
          </span>
        </div>
        {u?.createdAt ? (
          <p className="profil-joined">
            📅 Bergabung {new Date(u.createdAt).toLocaleDateString("id-ID")}
          </p>
        ) : null}
      </section>

      <section className="glass card-v2 anim-rise" style={{ animationDelay: "0.04s" }}>
        <h2>📋 Detail akun</h2>
        <div className="profil-details">
          <div className="profil-detail">
            <span className="profil-detail-k">ID</span>
            <span className="profil-detail-v">{u?.id || "—"}</span>
          </div>
          <div className="profil-detail">
            <span className="profil-detail-k">Email</span>
            <span className="profil-detail-v">{u?.email || "—"}</span>
          </div>
          <div className="profil-detail">
            <span className="profil-detail-k">Nama</span>
            <span className="profil-detail-v">{u?.displayName || "—"}</span>
          </div>
          <div className="profil-detail">
            <span className="profil-detail-k">A2F</span>
            <span
              className="profil-detail-v"
              style={{ color: u?.a2fEnabled ? "var(--mint)" : undefined }}
            >
              {u?.a2fEnabled ? "Aktif" : "Nonaktif"}
            </span>
          </div>
        </div>
      </section>

      <section className="glass card-v2 anim-rise" style={{ animationDelay: "0.08s" }}>
        <h2>🔑 Ubah password</h2>
        <form onSubmit={setPw} className="profil-form">
          <label className="auth-v2-field">
            <span className="auth-v2-label">Password lama</span>
            <input
              className="input"
              type={showPw ? "text" : "password"}
              value={oldPw}
              onChange={(e) => setOldPw(e.target.value)}
              placeholder="Password saat ini"
              autoComplete="current-password"
            />
          </label>
          <label className="auth-v2-field">
            <span className="auth-v2-label">Password baru</span>
            <input
              className="input"
              type={showPw ? "text" : "password"}
              placeholder="Minimal 6 karakter"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
            />
          </label>
          <label className="auth-v2-field">
            <span className="auth-v2-label">Konfirmasi password baru</span>
            <input
              className="input"
              type={showPw ? "text" : "password"}
              placeholder="Ulangi password baru"
              value={password2}
              onChange={(e) => setPassword2(e.target.value)}
              autoComplete="new-password"
            />
          </label>
          <label className="profil-show-pw">
            <input
              type="checkbox"
              checked={showPw}
              onChange={(e) => setShowPw(e.target.checked)}
            />
            <span>{showPw ? "🙉" : "🙈"} Tampilkan password</span>
          </label>
          <button
            type="submit"
            className="btn btn-block btn-press"
            style={{ marginTop: 4 }}
            disabled={busy === "pw"}
          >
            {busy === "pw" ? "⏳ Menyimpan…" : "Simpan password"}
          </button>
        </form>
      </section>

      <section className="glass card-v2 anim-rise" style={{ animationDelay: "0.12s" }}>
        <h2>🛡️ Keamanan A2F</h2>
        <p className="muted" style={{ marginBottom: 12 }}>
          Autentikasi 2 faktor menambahkan kode OTP saat login.
        </p>
        <button
          type="button"
          className="btn btn-block btn-press"
          disabled={busy !== null}
          onClick={toggleA2f}
        >
          {busy === "a2f"
            ? "⏳ Memproses…"
            : u?.a2fEnabled
              ? "Matikan A2F"
              : "Aktifkan A2F"}
        </button>
      </section>

      <section className="glass card-v2 anim-rise" style={{ animationDelay: "0.16s" }}>
        <button
          type="button"
          className="btn btn-block btn-ghost btn-press profil-logout"
          disabled={busy === "logout"}
          onClick={logout}
        >
          {busy === "logout" ? "Keluar…" : "🚪 Keluar dari akun"}
        </button>
      </section>
    </div>
  );
}

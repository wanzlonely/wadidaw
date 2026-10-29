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
          {u?.email || "—"}
        </p>
        <div className="account-badge">Password aktif</div>
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
            <strong className="detail-value">{u?.id || "—"}</strong>
          </div>
          <div className="detail-row">
            <span className="muted">Email</span>
            <strong className="detail-value">{u?.email || "—"}</strong>
          </div>
          <div className="detail-row">
            <span className="muted">Nama</span>
            <strong className="detail-value">{u?.displayName || "—"}</strong>
          </div>
          <div className="detail-row">
            <span className="muted">A2F</span>
            <strong
              className="detail-value"
              style={{
                color: u?.a2fEnabled ? "var(--mint)" : "var(--ink-dim)",
              }}
            >
              {u?.a2fEnabled ? "Aktif" : "Nonaktif"}
            </strong>
          </div>
        </div>
      </section>

      <section className="glass card-v2 anim-rise">
        <h2>Ubah password</h2>
        <form onSubmit={setPw}>
          <label className="field-label">Password lama</label>
          <input
            className="input field-input"
            type={showPw ? "text" : "password"}
            value={oldPw}
            onChange={(e) => setOldPw(e.target.value)}
            placeholder="Password saat ini"
            autoComplete="current-password"
          />
          <label className="field-label">Password baru</label>
          <input
            className="input field-input"
            type={showPw ? "text" : "password"}
            placeholder="Minimal 6 karakter"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
          />
          <label className="field-label">Konfirmasi password baru</label>
          <input
            className="input field-input"
            type={showPw ? "text" : "password"}
            placeholder="Ulangi password baru"
            value={password2}
            onChange={(e) => setPassword2(e.target.value)}
            autoComplete="new-password"
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
            type="submit"
            className="btn btn-primary btn-block btn-press"
            style={{ marginTop: 12 }}
            disabled={busy === "pw"}
          >
            {busy === "pw" ? "Menyimpan…" : "Simpan password"}
          </button>
        </form>
      </section>

      <section className="glass card-v2 anim-rise">
        <h2>Keamanan A2F</h2>
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
            ? "Memproses…"
            : u?.a2fEnabled
              ? "Matikan A2F"
              : "Aktifkan A2F"}
        </button>
      </section>

      <section className="glass card-v2 anim-rise">
        <button
          type="button"
          className="btn btn-block btn-ghost btn-press"
          disabled={busy === "logout"}
          onClick={logout}
        >
          {busy === "logout" ? "Keluar…" : "Keluar dari akun"}
        </button>
      </section>
    </>
  );
}

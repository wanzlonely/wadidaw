"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch, setStoredToken } from "@/lib/api";
import { pushBubble } from "@/components/BubbleToasts";

type UserInfo = {
  id: string;
  email: string;
  username: string;
  displayName: string;
  a2fEnabled: boolean;
  hasPassword: boolean;
  createdAt: string;
  updatedAt?: string;
};

type BusyKey = "pw" | "a2f" | "logout" | null;

function Svg({ children, size = 16 }: { children: React.ReactNode; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {children}
    </svg>
  );
}

function IconLock() {
  return (
    <Svg>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </Svg>
  );
}

function IconShield() {
  return (
    <Svg>
      <path d="M12 3l7 3v5c0 4.5-3 8-7 9.5C8 19 5 15.5 5 11V6l7-3z" />
    </Svg>
  );
}

function IconCalendar() {
  return (
    <Svg size={14}>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </Svg>
  );
}

function IconClipboard() {
  return (
    <Svg size={15}>
      <path d="M9 4h6l1 2H8l1-2z" />
      <path d="M7 6h10v13a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V6z" />
    </Svg>
  );
}

function IconKey() {
  return (
    <Svg size={15}>
      <circle cx="8" cy="14" r="3.5" />
      <path d="M11 12.5L19 4.5M16 4.5h3v3" />
    </Svg>
  );
}

function IconEye({ open }: { open: boolean }) {
  if (open) {
    return (
      <Svg size={15}>
        <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
        <circle cx="12" cy="12" r="3" />
      </Svg>
    );
  }
  return (
    <Svg size={15}>
      <path d="M3 3l18 18M10.6 10.6A3 3 0 0 0 12 15a3 3 0 0 0 2.4-1.2" />
      <path d="M9.9 5.2A11 11 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 3.8M6.1 6.1A17 17 0 0 0 2 12s3.5 7 10 7a10 10 0 0 0 4.2-.9" />
    </Svg>
  );
}

function IconLogout() {
  return (
    <Svg size={16}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="M16 17l5-5-5-5M21 12H9" />
    </Svg>
  );
}

function IconSpinner() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden className="spin-ico">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" opacity="0.25" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

export function AkunClient() {
  const [u, setU] = useState<UserInfo | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
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
        setLoadErr(null);
        setU({
          id: getData.user.id,
          email: getData.user.email,
          username: getData.user.username || "",
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
        setLoadErr(data.error || "Gagal memuat akun");
        return;
      }
      setLoadErr(null);
      setU(data.user);
    } catch {
      setLoadErr("Koneksi gagal");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function notify(title: string, tone: "ok" | "err" | "info" = "info", sub?: string) {
    pushBubble({ title, sub, tone });
  }

  async function setPw(e?: React.FormEvent) {
    e?.preventDefault();
    if (busy === "pw") return;

    if (!oldPw.trim()) {
      notify("Masukkan password lama", "err");
      return;
    }
    if (password.length < 6) {
      notify("Password minimal 6 karakter", "err");
      return;
    }
    if (password !== password2) {
      notify("Konfirmasi password tidak cocok", "err");
      return;
    }
    if (oldPw === password) {
      notify("Password baru harus berbeda", "err");
      return;
    }

    setBusy("pw");
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
        notify(data.error || "Gagal menyimpan password", "err");
        return;
      }
      setOldPw("");
      setPassword("");
      setPassword2("");
      notify("Password diperbarui", "ok", "Perubahan telah disimpan");
      load();
    } catch {
      notify("Koneksi gagal", "err");
    } finally {
      setBusy(null);
    }
  }

  async function toggleA2f() {
    if (!u) return;
    setBusy("a2f");
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
        notify("Gagal mengubah A2F", "err", data.error || "Coba lagi");
        return;
      }
      notify(u.a2fEnabled ? "A2F dimatikan" : "A2F diaktifkan", "ok", "Perubahan telah disimpan");
      load();
    } catch {
      notify("Koneksi gagal", "err");
    } finally {
      setBusy(null);
    }
  }

  async function logout() {
    setBusy("logout");
    notify("Keluar…", "info");
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

  if (!u && !loadErr) {
    return (
      <section className="glass card-v2">
        <p className="muted">Memuat akun…</p>
      </section>
    );
  }

  const initial = (u?.displayName || "W").charAt(0).toUpperCase();

  return (
    <div className="profil-v2">
      {loadErr ? (
        <section className="glass card-v2">
          <p style={{ color: "var(--rose)", margin: 0 }}>{loadErr}</p>
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
          <span className="profil-pill ok">
            <IconLock /> Password aktif
          </span>
          <span className={`profil-pill${u?.a2fEnabled ? " ok" : ""}`}>
            <IconShield /> {u?.a2fEnabled ? "A2F aktif" : "A2F off"}
          </span>
        </div>
        {u?.createdAt ? (
          <p className="profil-joined">
            <IconCalendar /> Bergabung{" "}
            {new Date(u.createdAt).toLocaleDateString("id-ID")}
          </p>
        ) : null}
      </section>

      <section className="glass card-v2 anim-rise" style={{ animationDelay: "0.04s" }}>
        <h2 className="profil-section-title">
          <IconClipboard /> Detail akun
        </h2>
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
            <span className="profil-detail-k">Username</span>
            <span className="profil-detail-v">{u?.username ? `@${u.username}` : "—"}</span>
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
        <h2 className="profil-section-title">
          <IconKey /> Ubah password
        </h2>
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
            <span className="profil-show-pw-label">
              <IconEye open={showPw} /> Tampilkan password
            </span>
          </label>
          <button
            type="submit"
            className="btn btn-block btn-press"
            style={{ marginTop: 4 }}
            disabled={busy === "pw"}
          >
            {busy === "pw" ? (
              <>
                <IconSpinner /> Menyimpan…
              </>
            ) : (
              "Simpan password"
            )}
          </button>
        </form>
      </section>

      <section className="glass card-v2 anim-rise" style={{ animationDelay: "0.12s" }}>
        <h2 className="profil-section-title">
          <IconShield /> Keamanan A2F
        </h2>
        <p className="muted" style={{ marginBottom: 12 }}>
          Autentikasi 2 faktor menambahkan kode OTP saat login.
        </p>
        <button
          type="button"
          className="btn btn-block btn-press"
          disabled={busy !== null}
          onClick={toggleA2f}
        >
          {busy === "a2f" ? (
            <>
              <IconSpinner /> Memproses…
            </>
          ) : u?.a2fEnabled ? (
            "Matikan A2F"
          ) : (
            "Aktifkan A2F"
          )}
        </button>
      </section>

      <section className="glass card-v2 anim-rise" style={{ animationDelay: "0.16s" }}>
        <button
          type="button"
          className="btn btn-block btn-ghost btn-press profil-logout"
          disabled={busy === "logout"}
          onClick={logout}
        >
          {busy === "logout" ? (
            "Keluar…"
          ) : (
            <>
              <IconLogout /> Keluar dari akun
            </>
          )}
        </button>
      </section>
    </div>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { setStoredToken, apiFetch } from "@/lib/api";
import {
  IconUser,
  IconMail,
  IconLock,
  IconEye,
  IconKey,
  IconSparkle,
  IconCalc,
  IconRefresh,
  IconInbox,
  IconAlert,
  IconCheck,
  IconSpinner,
} from "@/components/Icons";

type Mode = "login" | "register";

function makeMathChallenge() {
  const a = 1 + Math.floor(Math.random() * 9);
  const b = 1 + Math.floor(Math.random() * 9);
  return { question: `${a} + ${b}`, answer: String(a + b) };
}

export default function LoginPage() {
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [needOtp, setNeedOtp] = useState(false);
  const [otpUserId, setOtpUserId] = useState("");
  const [otpEmail, setOtpEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [captchaInput, setCaptchaInput] = useState("");
  const [challenge, setChallenge] = useState(makeMathChallenge);
  const [showPw, setShowPw] = useState(false);

  useEffect(() => {
    apiFetch("/api/auth")
      .then((r) => r.json())
      .then((d) => {
        if (d.authenticated) window.location.href = "/";
      })
      .catch(() => {});
  }, []);

  function resetCaptcha() {
    setChallenge(makeMathChallenge());
    setCaptchaInput("");
  }

  function switchMode(m: Mode) {
    setMode(m);
    setErr(null);
    setMsg(null);
    setShowPw(false);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setMsg(null);
    setBusy(true);
    try {
      const action = mode === "login" ? "login" : "register";
      const body: Record<string, unknown> = {
        action,
        email,
        password,
        captchaAnswer: captchaInput.trim(),
        captchaExpected: challenge.answer,
      };
      if (mode === "register") {
        body.displayName = displayName || email.split("@")[0];
        body.password2 = password2;
      }

      const res = await apiFetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setErr(data.error || "Gagal");
        resetCaptcha();
        return;
      }

      if (data.needOtp) {
        setNeedOtp(true);
        setOtpUserId(data.userId);
        setOtpEmail(data.email || email);
        setMsg(data.message || "Masukkan OTP dari email");
        return;
      }

      if (data.token) setStoredToken(data.token);
      setMsg("Berhasil! Mengalihkan…");
      window.location.href = "/";
    } catch {
      setErr("Koneksi gagal");
      resetCaptcha();
    } finally {
      setBusy(false);
    }
  }

  async function submitOtp(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      const res = await apiFetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "verify_otp",
          userId: otpUserId,
          code: otp,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErr(data.error || "OTP salah");
        return;
      }
      if (data.token) setStoredToken(data.token);
      setMsg("OTP OK — masuk…");
      window.location.href = "/";
    } catch {
      setErr("Koneksi gagal");
    } finally {
      setBusy(false);
    }
  }

  async function resendOtp() {
    setBusy(true);
    setErr(null);
    try {
      const res = await apiFetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "resend_otp", userId: otpUserId }),
      });
      const data = await res.json();
      if (!res.ok) setErr(data.error || "Gagal kirim ulang");
      else setMsg(data.message || "OTP dikirim ulang");
    } catch {
      setErr("Koneksi gagal");
    } finally {
      setBusy(false);
    }
  }

  const title = useMemo(
    () =>
      needOtp
        ? "Verifikasi OTP"
        : mode === "login"
          ? "Selamat datang"
          : "Buat akun baru",
    [needOtp, mode]
  );

  return (
    <div className="auth-v2">
      <div className="auth-v2-orb auth-v2-orb-a" aria-hidden />
      <div className="auth-v2-orb auth-v2-orb-b" aria-hidden />
      <div className="auth-v2-orb auth-v2-orb-c" aria-hidden />

      <div className="auth-v2-inner">
        <header className="auth-v2-hero anim-rise">
          <div className="auth-v2-mark" aria-hidden>
            <span>W</span>
            <i className="auth-v2-mark-ring" />
          </div>
          <h1 className="auth-v2-brand">WALZPAY</h1>
          <p className="auth-v2-sub">{title}</p>
          <p className="auth-v2-hint">QRIS · webhook · auto settle</p>
        </header>

        {msg ? (
          <div className="toast-banner anim-rise">
            <span className="inline-ico">
              <IconCheck size={15} />
            </span>{" "}
            {msg}
          </div>
        ) : null}
        {err ? (
          <div className="toast-banner anim-shake" style={{ background: "rgba(255,143,163,0.12)", borderColor: "rgba(255,143,163,0.3)", color: "var(--rose)" }}>
            <span className="inline-ico">
              <IconAlert size={15} />
            </span>{" "}
            {err}
          </div>
        ) : null}

        {!needOtp ? (
          <section className="glass card-v2 auth-v2-card anim-rise">
            <div className="auth-v2-tabs">
              <button
                type="button"
                className={mode === "login" ? "active" : undefined}
                onClick={() => switchMode("login")}
              >
                <span className="tab-ico">
                  <IconKey size={14} />
                </span>{" "}
                Masuk
              </button>
              <button
                type="button"
                className={mode === "register" ? "active" : undefined}
                onClick={() => switchMode("register")}
              >
                <span className="tab-ico">
                  <IconSparkle size={14} />
                </span>{" "}
                Daftar
              </button>
            </div>

            <form onSubmit={submit} className="auth-v2-form">
              {mode === "register" ? (
                <label className="auth-v2-field">
                  <span className="auth-v2-label">
                    <span className="lbl-ico">
                      <IconUser size={13} />
                    </span>{" "}
                    Nama tampilan
                  </span>
                  <input
                    className="input"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Nama toko / merchant"
                    autoComplete="name"
                  />
                </label>
              ) : null}

              <label className="auth-v2-field">
                <span className="auth-v2-label">
                  <span className="lbl-ico">
                    <IconMail size={13} />
                  </span>{" "}
                  Email
                </span>
                <input
                  className="input"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="email@contoh.com"
                  required
                  autoComplete="email"
                />
              </label>

              <label className="auth-v2-field">
                <span className="auth-v2-label">
                  <span className="lbl-ico">
                    <IconLock size={13} />
                  </span>{" "}
                  Password
                </span>
                <div className="input-with-action">
                  <input
                    className="input"
                    type={showPw ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Minimal 6 karakter"
                    required
                    minLength={6}
                    autoComplete={mode === "login" ? "current-password" : "new-password"}
                  />
                  <button
                    type="button"
                    className="input-action"
                    onClick={() => setShowPw((v) => !v)}
                    aria-label="Tampilkan password"
                  >
                    <IconEye size={15} open={showPw} />
                  </button>
                </div>
              </label>

              {mode === "register" ? (
                <label className="auth-v2-field">
                  <span className="auth-v2-label">
                    <span className="lbl-ico">
                      <IconLock size={13} />
                    </span>{" "}
                    Ulangi password
                  </span>
                  <div className="input-with-action">
                    <input
                      className="input"
                      type={showPw ? "text" : "password"}
                      value={password2}
                      onChange={(e) => setPassword2(e.target.value)}
                      placeholder="Ulangi password"
                      required
                      minLength={6}
                      autoComplete="new-password"
                    />
                    <button
                      type="button"
                      className="input-action"
                      onClick={() => setShowPw((v) => !v)}
                      aria-label="Tampilkan password"
                    >
                      <IconEye size={15} open={showPw} />
                    </button>
                  </div>
                </label>
              ) : null}

              <div className="auth-v2-captcha">
                <div className="auth-v2-captcha-top">
                  <span className="auth-v2-captcha-q">
                    <span className="lbl-ico">
                      <IconCalc size={14} />
                    </span>{" "}
                    {challenge.question} = ?
                  </span>
                  <button
                    type="button"
                    className="auth-v2-refresh"
                    onClick={resetCaptcha}
                    aria-label="Ganti soal"
                  >
                    <IconRefresh size={16} />
                  </button>
                </div>
                <input
                  className="input"
                  inputMode="numeric"
                  value={captchaInput}
                  onChange={(e) => setCaptchaInput(e.target.value)}
                  placeholder="Jawaban"
                  required
                />
              </div>

              <button
                type="submit"
                className="btn btn-block btn-press auth-v2-submit"
                disabled={busy}
              >
                {busy ? (
                  <>
                    <IconSpinner size={15} /> Memproses…
                  </>
                ) : mode === "login" ? (
                  "Masuk"
                ) : (
                  "Daftar"
                )}
              </button>
            </form>
          </section>
        ) : (
          <section className="glass card-v2 auth-v2-card anim-rise">
            <div className="auth-v2-otp-head">
              <span className="auth-v2-otp-ico">
                <IconInbox size={28} />
              </span>
              <p className="muted" style={{ margin: 0 }}>
                Kode dikirim ke <strong>{otpEmail}</strong>
              </p>
            </div>
            <form onSubmit={submitOtp} className="auth-v2-form">
              <label className="auth-v2-field">
                <span className="auth-v2-label">Kode OTP</span>
                <input
                  className="input"
                  inputMode="numeric"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  placeholder="6 digit"
                  required
                  autoFocus
                />
              </label>
              <button
                type="submit"
                className="btn btn-block btn-press"
                disabled={busy}
              >
                {busy ? (
                  <>
                    <IconSpinner size={15} /> Memverifikasi…
                  </>
                ) : (
                  "Verifikasi & masuk"
                )}
              </button>
              <button
                type="button"
                className="btn btn-block btn-ghost btn-press"
                disabled={busy}
                onClick={resendOtp}
              >
                <IconRefresh size={14} /> Kirim ulang OTP
              </button>
            </form>
          </section>
        )}

        <p className="auth-v2-footer muted">WALZPAY · liquid glass</p>
      </div>
    </div>
  );
}

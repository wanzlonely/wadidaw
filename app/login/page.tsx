"use client";

import { useEffect, useMemo, useState } from "react";
import { setStoredToken, apiFetch } from "@/lib/api";

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
    () => (needOtp ? "Verifikasi OTP" : mode === "login" ? "Masuk" : "Daftar"),
    [needOtp, mode]
  );

  return (
    <div className="auth-shell">
      <div className="auth-logo">
        <div className="logo-mark">W</div>
        <h1 className="auth-brand">WALZPAY</h1>
        <p className="auth-tag">{title}</p>
      </div>

      {msg ? (
        <div className="toast-bubble toast-bubble-in" role="status">
          {msg}
        </div>
      ) : null}
      {err ? (
        <div className="toast-bubble toast-bubble-err toast-bubble-in" role="alert">
          {err}
        </div>
      ) : null}

      <div className="auth-card glass">
        {!needOtp ? (
          <>
            <div className="auth-tabs">
              <button
                type="button"
                className={mode === "login" ? "active" : undefined}
                onClick={() => switchMode("login")}
              >
                Masuk
              </button>
              <button
                type="button"
                className={mode === "register" ? "active" : undefined}
                onClick={() => switchMode("register")}
              >
                Daftar
              </button>
            </div>

            <form onSubmit={submit} className="auth-form">
              {mode === "register" ? (
                <label className="auth-label">
                  Nama tampilan
                  <input
                    className="input"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Toko Saya"
                    autoComplete="name"
                  />
                </label>
              ) : null}

              <label className="auth-label">
                Email
                <input
                  className="input"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="email@contoh.com"
                  autoComplete="email"
                />
              </label>

              <label className="auth-label">
                Password
                <input
                  className="input"
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Minimal 6 karakter"
                  autoComplete={
                    mode === "login" ? "current-password" : "new-password"
                  }
                />
              </label>

              {mode === "register" ? (
                <label className="auth-label">
                  Ulangi password
                  <input
                    className="input"
                    type="password"
                    required
                    minLength={6}
                    value={password2}
                    onChange={(e) => setPassword2(e.target.value)}
                    placeholder="Ulangi password"
                    autoComplete="new-password"
                  />
                </label>
              ) : null}

              <div className="captcha-math">
                <div className="captcha-row">
                  <span className="captcha-q">{challenge.question} = ?</span>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={resetCaptcha}
                    title="Soal baru"
                  >
                    ↻
                  </button>
                </div>
                <input
                  className="input"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  required
                  value={captchaInput}
                  onChange={(e) =>
                    setCaptchaInput(e.target.value.replace(/\D/g, ""))
                  }
                  placeholder="Jawaban"
                  autoComplete="off"
                />
              </div>

              <button
                type="submit"
                className="btn btn-primary btn-block btn-press"
                disabled={busy}
              >
                {busy
                  ? "Memproses…"
                  : mode === "login"
                    ? "Masuk"
                    : "Daftar akun"}
              </button>
            </form>
          </>
        ) : (
          <form onSubmit={submitOtp} className="auth-form">
            <h2 style={{ marginBottom: 8, textAlign: "center" }}>Kode OTP</h2>
            <p className="muted" style={{ textAlign: "center", marginBottom: 16 }}>
              Kode 6 digit dikirim ke{" "}
              <strong style={{ color: "var(--ink)" }}>{otpEmail}</strong>
            </p>
            <label className="auth-label">
              Masukkan OTP
              <input
                className="input otp-single"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                required
                value={otp}
                onChange={(e) =>
                  setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))
                }
                placeholder="••••••"
                autoComplete="one-time-code"
                autoFocus
              />
            </label>
            <button
              type="submit"
              className="btn btn-primary btn-block btn-press"
              disabled={busy || otp.length < 6}
            >
              {busy ? "Memverifikasi…" : "Verifikasi & masuk"}
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-block"
              style={{ marginTop: 10 }}
              disabled={busy}
              onClick={resendOtp}
            >
              Kirim ulang OTP
            </button>
          </form>
        )}
      </div>

      <p className="auth-foot muted">
        Data per akun terpisah · Session aman 14 hari
      </p>
    </div>
  );
}

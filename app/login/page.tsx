"use client";

import { useEffect, useRef, useState } from "react";

type Mode = "login" | "register" | "a2f";

export default function LoginPage() {
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [otpPreview, setOtpPreview] = useState<string | null>(null);

  // Captcha: klik lalu tunggu
  const [capId, setCapId] = useState<string | null>(null);
  const [capWait, setCapWait] = useState(2000);
  const [capPhase, setCapPhase] = useState<"idle" | "waiting" | "done">("idle");
  const [capProgress, setCapProgress] = useState(0);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const waitTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    // sudah login? ke dashboard
    const t = localStorage.getItem("walzpay_token");
    if (t) {
      fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "me", token: t }),
      }).then(async (r) => {
        const d = await r.json();
        if (r.ok && d.ok && d.a2fVerified) {
          window.location.href = "/";
        }
      });
    }
    loadCaptcha();
    return () => {
      if (waitTimer.current) clearInterval(waitTimer.current);
    };
  }, []);

  async function loadCaptcha() {
    setCapPhase("idle");
    setCapProgress(0);
    setCaptchaToken(null);
    const res = await fetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "captcha_create" }),
    });
    const data = await res.json();
    if (res.ok) {
      setCapId(data.id);
      setCapWait(data.waitMs || 2000);
    }
  }

  function startCaptcha() {
    if (!capId || capPhase !== "idle") return;
    setCapPhase("waiting");
    setCapProgress(0);
    const started = Date.now();
    if (waitTimer.current) clearInterval(waitTimer.current);
    waitTimer.current = setInterval(async () => {
      const elapsed = Date.now() - started;
      const pct = Math.min(100, (elapsed / capWait) * 100);
      setCapProgress(pct);
      if (elapsed >= capWait) {
        if (waitTimer.current) clearInterval(waitTimer.current);
        const res = await fetch("/api/auth", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "captcha_solve", id: capId }),
        });
        const data = await res.json();
        if (res.ok) {
          setCaptchaToken(data.captchaToken);
          setCapPhase("done");
          setCapProgress(100);
        } else {
          setErr(data.error || "Captcha gagal");
          setCapPhase("idle");
          loadCaptcha();
        }
      }
    }, 80);
  }

  async function submit() {
    setErr(null);
    setMsg(null);
    setBusy(true);

    if (mode === "a2f" && token) {
      const code = otp.join("");
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "verify_a2f", token, code }),
      });
      const data = await res.json();
      setBusy(false);
      if (!res.ok) {
        setErr(data.error || "Kode salah");
        return;
      }
      localStorage.setItem("walzpay_token", token);
      window.location.href = "/";
      return;
    }

    if (!captchaToken) {
      setBusy(false);
      setErr("Selesaikan verifikasi captcha dulu");
      return;
    }

    const action = mode === "register" ? "register" : "login";
    const res = await fetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action,
        email,
        password,
        displayName,
        captchaToken,
      }),
    });
    const data = await res.json();
    setBusy(false);

    if (!res.ok) {
      setErr(data.error || "Gagal");
      loadCaptcha();
      return;
    }

    if (action === "register") {
      setMsg("Registrasi berhasil. Silakan login.");
      setMode("login");
      setPassword("");
      loadCaptcha();
      return;
    }

    if (data.needA2f) {
      setToken(data.token);
      setOtpPreview(data.otpPreview || null);
      setMode("a2f");
      setMsg("Masukkan kode A2F 6 digit");
      return;
    }

    localStorage.setItem("walzpay_token", data.token);
    window.location.href = "/";
  }

  function onOtpChange(i: number, v: string) {
    const digit = v.replace(/\D/g, "").slice(-1);
    const next = [...otp];
    next[i] = digit;
    setOtp(next);
    if (digit && i < 5) otpRefs.current[i + 1]?.focus();
  }

  return (
    <div className="auth-shell">
      <div className="auth-logo">
        <div className="logo-mark">W</div>
        <h1 className="auth-brand">WALZPAY</h1>
        <p className="auth-tag">Pembayaran QRIS otomatis</p>
      </div>

      <section className="glass card-v2 auth-card anim-pop">
        {mode !== "a2f" ? (
          <div className="auth-tabs">
            <button
              type="button"
              className={mode === "login" ? "active" : ""}
              onClick={() => {
                setMode("login");
                setErr(null);
              }}
            >
              Login
            </button>
            <button
              type="button"
              className={mode === "register" ? "active" : ""}
              onClick={() => {
                setMode("register");
                setErr(null);
              }}
            >
              Daftar
            </button>
          </div>
        ) : (
          <h2 style={{ marginBottom: 8 }}>Autentikasi 2 faktor</h2>
        )}

        {err ? (
          <p style={{ color: "var(--rose)", marginBottom: 10, fontSize: 13 }}>
            {err}
          </p>
        ) : null}
        {msg ? (
          <p style={{ color: "var(--mint)", marginBottom: 10, fontSize: 13 }}>
            {msg}
          </p>
        ) : null}

        {mode === "a2f" ? (
          <>
            <p className="muted">
              Masukkan kode 6 digit.
              {otpPreview ? (
                <span style={{ color: "var(--amber)" }}>
                  {" "}(Demo: {otpPreview})
                </span>
              ) : null}
            </p>
            <div className="otp-inputs">
              {otp.map((d, i) => (
                <input
                  key={i}
                  ref={(el) => {
                    otpRefs.current[i] = el;
                  }}
                  inputMode="numeric"
                  maxLength={1}
                  value={d}
                  onChange={(e) => onOtpChange(i, e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Backspace" && !otp[i] && i > 0) {
                      otpRefs.current[i - 1]?.focus();
                    }
                  }}
                />
              ))}
            </div>
            <button
              type="button"
              className="btn btn-block btn-press"
              disabled={busy || otp.join("").length < 6}
              onClick={submit}
            >
              {busy ? "Memverifikasi…" : "Verifikasi"}
            </button>
          </>
        ) : (
          <>
            {mode === "register" ? (
              <>
                <label className="muted" style={{ fontSize: 12 }}>
                  Nama tampilan
                </label>
                <input
                  className="input"
                  style={{ width: "100%", marginTop: 4, marginBottom: 10 }}
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Nama merchant"
                />
              </>
            ) : null}
            <label className="muted" style={{ fontSize: 12 }}>
              Email
            </label>
            <input
              className="input"
              style={{ width: "100%", marginTop: 4, marginBottom: 10 }}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="anda@email.com"
              autoComplete="email"
            />
            <label className="muted" style={{ fontSize: 12 }}>
              Password
            </label>
            <input
              className="input"
              style={{ width: "100%", marginTop: 4 }}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Minimal 6 karakter"
              autoComplete={
                mode === "login" ? "current-password" : "new-password"
              }
            />

            <div className="captcha-box">
              {capPhase === "idle" ? (
                <button
                  type="button"
                  className="captcha-btn"
                  onClick={startCaptcha}
                  disabled={!capId}
                >
                  <span className="captcha-check">□</span>
                  Saya bukan robot — klik untuk verifikasi
                </button>
              ) : null}
              {capPhase === "waiting" ? (
                <div className="captcha-waiting">
                  <div className="captcha-bar">
                    <div
                      className="captcha-bar-fill"
                      style={{ width: `${capProgress}%` }}
                    />
                  </div>
                  <span>Memverifikasi… tunggu sebentar</span>
                </div>
              ) : null}
              {capPhase === "done" ? (
                <div className="captcha-done">
                  <span className="captcha-check ok">✓</span>
                  Verifikasi berhasil
                </div>
              ) : null}
            </div>

            <button
              type="button"
              className="btn btn-block btn-press"
              style={{ marginTop: 14 }}
              disabled={
                busy ||
                !email ||
                password.length < 6 ||
                capPhase !== "done" ||
                !captchaToken
              }
              onClick={submit}
            >
              {busy
                ? "Memproses…"
                : mode === "register"
                  ? "Daftar akun"
                  : "Masuk"}
            </button>
          </>
        )}
      </section>
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

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
  const [humanOk, setHumanOk] = useState(false);

  const signals = useRef({
    moveCount: 0,
    keyCount: 0,
    durationMs: 0,
    focusEvents: 0,
    startedAt: Date.now(),
  });
  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    const onMove = () => {
      signals.current.moveCount += 1;
      checkHuman();
    };
    const onKey = () => {
      signals.current.keyCount += 1;
      checkHuman();
    };
    const onFocus = () => {
      signals.current.focusEvents += 1;
      checkHuman();
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("keydown", onKey);
    window.addEventListener("focus", onFocus);
    const t = setInterval(() => {
      signals.current.durationMs = Date.now() - signals.current.startedAt;
      checkHuman();
    }, 400);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("focus", onFocus);
      clearInterval(t);
    };
  }, []);

  function checkHuman() {
    const s = signals.current;
    s.durationMs = Date.now() - s.startedAt;
    const score =
      (s.moveCount >= 3 ? 30 : s.moveCount >= 1 ? 10 : 0) +
      (s.keyCount >= 2 ? 25 : 0) +
      (s.durationMs >= 1500 ? 25 : s.durationMs >= 600 ? 10 : 0) +
      (s.focusEvents >= 1 ? 20 : 0);
    setHumanOk(score >= 50);
  }

  async function submit() {
    setErr(null);
    setMsg(null);
    setBusy(true);
    signals.current.durationMs = Date.now() - signals.current.startedAt;

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
      setMsg("Berhasil masuk");
      window.location.href = "/";
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
        signals: {
          moveCount: signals.current.moveCount,
          keyCount: signals.current.keyCount,
          durationMs: signals.current.durationMs,
          focusEvents: signals.current.focusEvents,
        },
      }),
    });
    const data = await res.json();
    setBusy(false);

    if (!res.ok) {
      setErr(data.error || "Gagal");
      return;
    }

    if (action === "register") {
      setMsg("Registrasi berhasil. Silakan login.");
      setMode("login");
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
    setMsg("Berhasil masuk");
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
        <div className="logo logo-live">
          <span className="logo-text">WALZPAY</span>
          <span className="logo-shine" aria-hidden />
        </div>
        <p className="tagline" style={{ marginTop: 8 }}>
          Login aman · Upstash Redis
        </p>
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
                <>
                  {" "}
                  <span style={{ color: "var(--amber)" }}>
                    (Demo OTP: {otpPreview})
                  </span>
                </>
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
              autoComplete={mode === "login" ? "current-password" : "new-password"}
            />

            <div className={`human-check${humanOk ? " ok" : ""}`}>
              {humanOk
                ? "✓ Verifikasi manusia OK"
                : "Gerakkan pointer / ketik sebentar untuk verifikasi…"}
            </div>

            <button
              type="button"
              className="btn btn-block btn-press"
              style={{ marginTop: 14 }}
              disabled={busy || !email || password.length < 6 || !humanOk}
              onClick={submit}
            >
              {busy
                ? "Memproses…"
                : mode === "register"
                  ? "Daftar"
                  : "Masuk"}
            </button>
          </>
        )}
      </section>

      <p className="muted" style={{ textAlign: "center", marginTop: 20, fontSize: 13 }}>
        <Link href="/">← Kembali ke beranda</Link>
      </p>
    </div>
  );
}

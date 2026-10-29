"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

type Settings = {
  displayName: string;
  apiKey: string;
  webhookSecret: string;
  feeType: "none" | "fixed" | "percent";
  feeValue: number;
  defaultExpiryMinutes: number;
  hasPassword: boolean;
  updatedAt: string;
};

export function ProfileClient() {
  const [s, setS] = useState<Settings | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [hookPath, setHookPath] = useState("/api/webhook");

  const load = useCallback(async () => {
    const res = await fetch("/api/settings");
    const data = await res.json();
    if (!res.ok) {
      setErr(data.error || "Gagal load");
      return;
    }
    setErr(null);
    setS(data.settings);
  }, []);

  useEffect(() => {
    load();
    if (typeof window !== "undefined") {
      setHookPath(`${window.location.origin}/api/webhook`);
    }
  }, [load]);

  async function save() {
    if (!s) return;
    setBusy(true);
    setMsg(null);
    const res = await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "update",
        displayName: s.displayName,
        webhookSecret: s.webhookSecret,
        feeType: s.feeType,
        feeValue: s.feeValue,
        defaultExpiryMinutes: s.defaultExpiryMinutes,
      }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setErr(data.error || "Gagal simpan");
      return;
    }
    setS(data.settings);
    setMsg("Profil disimpan");
  }

  async function rotateKey() {
    if (!confirm("Generate API key baru?")) return;
    setBusy(true);
    const res = await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "rotate_api_key" }),
    });
    const data = await res.json();
    setBusy(false);
    if (res.ok) {
      setS((prev) => (prev ? { ...prev, apiKey: data.apiKey } : prev));
      setMsg("API key baru dibuat");
    }
  }

  async function setPw() {
    setBusy(true);
    const res = await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "set_password", password }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setErr(data.error || "Gagal");
      return;
    }
    setPassword("");
    setMsg("Password diperbarui");
    load();
  }

  async function clearPw() {
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

  async function copy(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      setMsg(`${label} disalin`);
    } catch {
      /* ignore */
    }
  }

  if (!s) {
    return (
      <section className="glass">
        <p className="muted">{err || "Memuat…"}</p>
      </section>
    );
  }

  return (
    <>
      {err ? (
        <section className="glass">
          <p style={{ color: "var(--rose)" }}>{err}</p>
        </section>
      ) : null}
      {msg ? (
        <section className="glass">
          <p style={{ color: "var(--mint)" }}>{msg}</p>
        </section>
      ) : null}

      <section className="glass">
        <h2>Profil merchant</h2>
        <label className="muted" style={{ display: "block", marginTop: 10 }}>
          Nama tampilan
        </label>
        <input
          className="input"
          style={{ width: "100%", marginTop: 4 }}
          value={s.displayName}
          onChange={(e) => setS({ ...s, displayName: e.target.value })}
        />
        <button type="button" className="btn btn-block" style={{ marginTop: 12 }} disabled={busy} onClick={save}>
          Simpan profil
        </button>
      </section>

      <section className="glass">
        <h2>API key</h2>
        <p className="muted">Untuk integrasi eksternal (header x-api-key).</p>
        <p className="muted" style={{ marginTop: 8, wordBreak: "break-all", fontFamily: "monospace", fontSize: 13 }}>
          {s.apiKey}
        </p>
        <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
          <button type="button" className="btn btn-ghost" onClick={() => copy(s.apiKey, "API key")}>
            Salin
          </button>
          <button type="button" className="btn btn-ghost" disabled={busy} onClick={rotateKey}>
            Rotate key
          </button>
        </div>
      </section>

      <section className="glass">
        <h2>Webhook listener</h2>
        <p className="muted">URL untuk Android listener / forwarder.</p>
        <p className="muted" style={{ marginTop: 8, wordBreak: "break-all", fontFamily: "monospace", fontSize: 13 }}>
          {hookPath}
        </p>
        <button type="button" className="btn btn-ghost" style={{ marginTop: 8 }} onClick={() => copy(hookPath, "Webhook URL")}>
          Salin URL
        </button>
        <label className="muted" style={{ display: "block", marginTop: 14 }}>
          Webhook secret (opsional)
        </label>
        <input
          className="input"
          style={{ width: "100%", marginTop: 4 }}
          placeholder="Sama dengan WEBHOOK_SECRET / app listener"
          value={s.webhookSecret}
          onChange={(e) => setS({ ...s, webhookSecret: e.target.value })}
        />
        <button type="button" className="btn btn-block" style={{ marginTop: 10 }} disabled={busy} onClick={save}>
          Simpan secret
        </button>
      </section>

      <section className="glass">
        <h2>Biaya admin default</h2>
        <p className="muted">
          Digabung ke totalAmount + kode unik agar order nominal sama tetap match akurat.
        </p>
        <select
          className="input"
          style={{ width: "100%", marginTop: 10 }}
          value={s.feeType}
          onChange={(e) => setS({ ...s, feeType: e.target.value as Settings["feeType"] })}
        >
          <option value="none">Tanpa biaya admin</option>
          <option value="fixed">Fixed (Rp)</option>
          <option value="percent">Persen (%)</option>
        </select>
        {s.feeType !== "none" ? (
          <input
            className="input"
            style={{ width: "100%", marginTop: 8 }}
            type="number"
            value={s.feeValue || ""}
            onChange={(e) => setS({ ...s, feeValue: Number(e.target.value) || 0 })}
          />
        ) : null}
        <label className="muted" style={{ display: "block", marginTop: 12 }}>
          Default masa berlaku order (menit)
        </label>
        <select
          className="input"
          style={{ width: "100%", marginTop: 4 }}
          value={s.defaultExpiryMinutes}
          onChange={(e) => setS({ ...s, defaultExpiryMinutes: Number(e.target.value) })}
        >
          <option value={10}>10</option>
          <option value={15}>15</option>
          <option value={30}>30</option>
          <option value={60}>60</option>
          <option value={120}>120</option>
        </select>
        <button type="button" className="btn btn-block" style={{ marginTop: 12 }} disabled={busy} onClick={save}>
          Simpan default fee & expiry
        </button>
      </section>

      <section className="glass">
        <h2>Password profil</h2>
        <p className="muted">{s.hasPassword ? "Password sudah diset." : "Belum ada password (opsional)."}</p>
        <input
          className="input"
          style={{ width: "100%", marginTop: 8 }}
          type="password"
          placeholder="Password baru (min 6)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
          <button type="button" className="btn" disabled={busy || password.length < 6} onClick={setPw}>
            Set password
          </button>
          {s.hasPassword ? (
            <button type="button" className="btn btn-ghost" disabled={busy} onClick={clearPw}>
              Hapus password
            </button>
          ) : null}
        </div>
      </section>

      <section className="glass">
        <h2>Debug</h2>
        <Link href="/debug" className="btn btn-block" style={{ display: "block", textAlign: "center" }}>
          Buka debug log
        </Link>
      </section>
    </>
  );
}

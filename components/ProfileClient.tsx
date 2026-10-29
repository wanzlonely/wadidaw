"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { decodeQrisFromImage } from "@/lib/decode-qris-image";
import { isLikelyQris, parseQrisMeta } from "@/lib/qris-convert";

type Settings = {
  displayName: string;
  apiKey: string;
  webhookSecret: string;
  feeType: "none" | "fixed" | "percent" | "random";
  feeValue: number;
  feeMin: number;
  feeMax: number;
  defaultExpiryMinutes: number;
  enabledMerchants: string[];
  hasPassword: boolean;
  updatedAt: string;
};

type StaticQris = {
  id: string;
  label: string;
  merchantName: string;
  merchantCity: string;
  packageHint?: string | null;
  createdAt: string;
};

export function ProfileClient() {
  const [s, setS] = useState<Settings | null>(null);
  const [templates, setTemplates] = useState<StaticQris[]>([]);
  const [busy, setBusy] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [hookPath, setHookPath] = useState("/api/webhook");
  const [preview, setPreview] = useState<{
    qrisString: string;
    merchantName: string;
    merchantCity: string;
  } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const [sRes, qRes] = await Promise.all([
      fetch("/api/settings"),
      fetch("/api/qris-static"),
    ]);
    const sData = await sRes.json();
    const qData = await qRes.json();
    if (!sRes.ok) {
      setErr(sData.error || "Gagal load");
      return;
    }
    setErr(null);
    setS({
      ...sData.settings,
      enabledMerchants: sData.settings.enabledMerchants ?? [],
      feeMin: sData.settings.feeMin ?? 1,
      feeMax: sData.settings.feeMax ?? 99,
    });
    setTemplates(qData.items ?? []);
  }, []);

  useEffect(() => {
    load();
    if (typeof window !== "undefined") {
      setHookPath(`${window.location.origin}/api/webhook`);
    }
  }, [load]);

  async function onPickImage(file: File | null) {
    if (!file) return;
    setScanning(true);
    setErr(null);
    setPreview(null);
    try {
      const raw = await decodeQrisFromImage(file);
      if (!isLikelyQris(raw)) {
        throw new Error("QR terdeteksi tapi bukan QRIS EMVCo yang valid");
      }
      const meta = parseQrisMeta(raw);
      setPreview({
        qrisString: raw,
        merchantName: meta.merchantName,
        merchantCity: meta.merchantCity,
      });
      setMsg("QRIS terdeteksi — periksa info lalu simpan");
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setScanning(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function saveStatic() {
    if (!preview) return;
    setBusy(true);
    setMsg(null);
    const res = await fetch("/api/qris-static", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        qrisString: preview.qrisString,
        label: preview.merchantName,
      }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setErr(data.error || "Gagal simpan QRIS");
      return;
    }
    setPreview(null);
    setMsg("QRIS statis disimpan");
    load();
  }

  async function deleteStatic(id: string) {
    if (!confirm("Hapus QRIS ini?")) return;
    await fetch(`/api/qris-static?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    load();
  }

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
        feeMin: s.feeMin,
        feeMax: s.feeMax,
        defaultExpiryMinutes: s.defaultExpiryMinutes,
        enabledMerchants: s.enabledMerchants,
      }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setErr(data.error || "Gagal simpan");
      return;
    }
    setS({
      ...data.settings,
      enabledMerchants: data.settings.enabledMerchants ?? [],
      feeMin: data.settings.feeMin ?? 1,
      feeMax: data.settings.feeMax ?? 99,
    });
    setMsg("Pengaturan disimpan");
  }

  async function rotateKey() {
    if (!confirm("Generate API key baru? Key lama tidak bisa dipakai.")) return;
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
        <p className="muted">{err || "Memuat\u2026"}</p>
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
        <h2>QRIS statis \u00b7 maks. 3</h2>
        <p className="muted" style={{ marginBottom: 12 }}>
          Upload foto QRIS dari galeri. String & info dibaca otomatis.
        </p>

        {templates.map((t) => (
          <div key={t.id} className="list-item" style={{ marginTop: 10 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, color: "var(--ink)" }}>
                {t.label || t.merchantName}
              </div>
              <p className="muted">
                {t.merchantName}
                {t.merchantCity ? ` \u00b7 ${t.merchantCity}` : ""}
              </p>
            </div>
            <button
              type="button"
              className="btn btn-ghost"
              style={{ marginTop: 0 }}
              onClick={() => deleteStatic(t.id)}
            >
              Hapus
            </button>
          </div>
        ))}

        {templates.length < 3 ? (
          <div style={{ marginTop: 14 }}>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              style={{ display: "none" }}
              onChange={(e) => onPickImage(e.target.files?.[0] ?? null)}
            />
            <button
              type="button"
              className="btn btn-block"
              disabled={scanning || busy}
              onClick={() => fileRef.current?.click()}
            >
              {scanning ? "Membaca QR\u2026" : "Upload gambar QRIS"}
            </button>

            {preview ? (
              <div className="preview-box">
                <p style={{ fontWeight: 600, color: "var(--ink)" }}>
                  {preview.merchantName}
                </p>
                <p className="muted">{preview.merchantCity || "\u2014"}</p>
                <p
                  className="muted"
                  style={{
                    fontSize: 11,
                    fontFamily: "monospace",
                    wordBreak: "break-all",
                    marginTop: 8,
                  }}
                >
                  {preview.qrisString.slice(0, 80)}\u2026
                </p>
                <button
                  type="button"
                  className="btn btn-block"
                  style={{ marginTop: 12 }}
                  disabled={busy}
                  onClick={saveStatic}
                >
                  Simpan QRIS
                </button>
                <button
                  type="button"
                  className="btn btn-block btn-ghost"
                  style={{ marginTop: 8 }}
                  onClick={() => setPreview(null)}
                >
                  Batal
                </button>
              </div>
            ) : null}
          </div>
        ) : (
          <p className="muted" style={{ marginTop: 10 }}>
            Slot penuh (3/3)
          </p>
        )}
      </section>

      <section className="glass">
        <h2>Sumber notifikasi</h2>
        <p className="muted" style={{ marginBottom: 8 }}>
          Pilih aplikasi sumber notifikasi langsung di aplikasi listener Android
          (tombol <strong style={{ color: "var(--ink)" }}>Pilih sumber notifikasi</strong>).
          Daftar aplikasi diambil dari perangkat HP Anda.
        </p>
      </section>

      <section className="glass">
        <h2>Biaya & masa berlaku</h2>
        <label className="muted" style={{ display: "block", marginTop: 8 }}>
          Mode biaya admin
        </label>
        <select
          className="input"
          style={{ width: "100%", marginTop: 4 }}
          value={s.feeType}
          onChange={(e) =>
            setS({
              ...s,
              feeType: e.target.value as Settings["feeType"],
            })
          }
        >
          <option value="random">Acak (anti-collision, disarankan)</option>
          <option value="fixed">Fixed (Rp)</option>
          <option value="percent">Persen (%)</option>
          <option value="none">Tanpa biaya ekstra</option>
        </select>
        {s.feeType === "random" ? (
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <div style={{ flex: 1 }}>
              <label className="muted" style={{ fontSize: 12 }}>Min (Rp)</label>
              <input
                className="input"
                style={{ width: "100%", marginTop: 4 }}
                type="number"
                value={s.feeMin ?? 1}
                onChange={(e) =>
                  setS({ ...s, feeMin: Math.max(0, Number(e.target.value) || 0) })
                }
              />
            </div>
            <div style={{ flex: 1 }}>
              <label className="muted" style={{ fontSize: 12 }}>Max (Rp)</label>
              <input
                className="input"
                style={{ width: "100%", marginTop: 4 }}
                type="number"
                value={s.feeMax ?? 99}
                onChange={(e) =>
                  setS({ ...s, feeMax: Math.max(0, Number(e.target.value) || 0) })
                }
              />
            </div>
          </div>
        ) : null}
        {s.feeType === "fixed" || s.feeType === "percent" ? (
          <input
            className="input"
            style={{ width: "100%", marginTop: 8 }}
            type="number"
            placeholder={s.feeType === "fixed" ? "Rp" : "%"}
            value={s.feeValue || ""}
            onChange={(e) =>
              setS({ ...s, feeValue: Number(e.target.value) || 0 })
            }
          />
        ) : null}
        <label className="muted" style={{ display: "block", marginTop: 12 }}>
          Default expired order
        </label>
        <select
          className="input"
          style={{ width: "100%", marginTop: 4 }}
          value={s.defaultExpiryMinutes}
          onChange={(e) =>
            setS({ ...s, defaultExpiryMinutes: Number(e.target.value) })
          }
        >
          <option value={10}>10 menit</option>
          <option value={15}>15 menit</option>
          <option value={30}>30 menit</option>
          <option value={60}>60 menit</option>
          <option value={120}>2 jam</option>
        </select>
        <button
          type="button"
          className="btn btn-block"
          style={{ marginTop: 12 }}
          disabled={busy}
          onClick={save}
        >
          Simpan
        </button>
      </section>

      <section className="glass">
        <h2>Profil</h2>
        <label className="muted" style={{ display: "block", marginTop: 8 }}>
          Nama tampilan
        </label>
        <input
          className="input"
          style={{ width: "100%", marginTop: 4 }}
          value={s.displayName}
          onChange={(e) => setS({ ...s, displayName: e.target.value })}
        />
        <button
          type="button"
          className="btn btn-block"
          style={{ marginTop: 12 }}
          disabled={busy}
          onClick={save}
        >
          Simpan profil
        </button>
      </section>

      <section className="glass">
        <h2>Webhook HP</h2>
        <p
          className="muted"
          style={{
            wordBreak: "break-all",
            fontFamily: "monospace",
            fontSize: 12,
          }}
        >
          {hookPath}
        </p>
        <button
          type="button"
          className="btn btn-ghost"
          style={{ marginTop: 8 }}
          onClick={() => copy(hookPath, "Webhook URL")}
        >
          Salin URL
        </button>
        <label className="muted" style={{ display: "block", marginTop: 14 }}>
          Webhook secret
        </label>
        <input
          className="input"
          style={{ width: "100%", marginTop: 4 }}
          placeholder="Opsional \u00b7 samakan dengan app listener"
          value={s.webhookSecret}
          onChange={(e) => setS({ ...s, webhookSecret: e.target.value })}
        />
        <button
          type="button"
          className="btn btn-block"
          style={{ marginTop: 10 }}
          disabled={busy}
          onClick={save}
        >
          Simpan secret
        </button>
      </section>

      <section className="glass">
        <h2>API key</h2>
        <p
          className="muted"
          style={{
            wordBreak: "break-all",
            fontFamily: "monospace",
            fontSize: 12,
          }}
        >
          {s.apiKey}
        </p>
        <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => copy(s.apiKey, "API key")}
          >
            Salin
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            disabled={busy}
            onClick={rotateKey}
          >
            Rotate
          </button>
        </div>
      </section>

      <section className="glass">
        <h2>Password</h2>
        <p className="muted">
          {s.hasPassword ? "Password aktif." : "Opsional."}
        </p>
        <input
          className="input"
          style={{ width: "100%", marginTop: 8 }}
          type="password"
          placeholder="Password baru (min 6)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
          <button
            type="button"
            className="btn"
            disabled={busy || password.length < 6}
            onClick={setPw}
          >
            Set password
          </button>
          {s.hasPassword ? (
            <button
              type="button"
              className="btn btn-ghost"
              disabled={busy}
              onClick={clearPw}
            >
              Hapus
            </button>
          ) : null}
        </div>
      </section>
    </>
  );
}

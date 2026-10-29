"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { decodeQrisFromImage } from "@/lib/decode-qris-image";
import { isLikelyQris, parseQrisMeta } from "@/lib/qris-convert";
import { apiFetch } from "@/lib/client-api";
import { pushBubble } from "@/components/BubbleToasts";

type Settings = {
  displayName: string;
  apiKey: string;
  webhookSecret: string;
  feeType: "random";
  feeValue: number;
  feeMin: number;
  feeMax: number;
  defaultExpiryMinutes: number;
  enabledMerchants: string[];
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
  const [err, setErr] = useState<string | null>(null);
  const [hookPath, setHookPath] = useState("/api/webhook");
  const [feeMinStr, setFeeMinStr] = useState("1");
  const [feeMaxStr, setFeeMaxStr] = useState("99");
  const [preview, setPreview] = useState<{
    qrisString: string;
    merchantName: string;
    merchantCity: string;
  } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const [sRes, qRes] = await Promise.all([
      apiFetch("/api/settings"),
      apiFetch("/api/qris-static"),
    ]);
    const sData = await sRes.json();
    const qData = await qRes.json();
    if (!sRes.ok) {
      setErr(sData.error || "Gagal memuat");
      return;
    }
    setErr(null);
    const min = sData.settings.feeMin ?? 1;
    const max = sData.settings.feeMax ?? 99;
    setS({
      ...sData.settings,
      feeType: "random",
      enabledMerchants: sData.settings.enabledMerchants ?? [],
      feeMin: min,
      feeMax: max,
    });
    setFeeMinStr(String(min));
    setFeeMaxStr(String(max));
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
      pushBubble({ title: "QRIS terdeteksi", sub: "Periksa lalu simpan", tone: "info" });
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
    const res = await apiFetch("/api/qris-static", {
      method: "POST",
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
    pushBubble({ title: "QRIS disimpan", tone: "ok" });
    load();
  }

  async function deleteStatic(id: string) {
    if (!confirm("Hapus QRIS ini?")) return;
    await apiFetch(`/api/qris-static?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    load();
  }

  async function save() {
    if (!s) return;
    const min = Math.max(0, Number(feeMinStr) || 0);
    const max = Math.max(min, Number(feeMaxStr) || 0);
    setBusy(true);
    const res = await apiFetch("/api/settings", {
      method: "POST",
      body: JSON.stringify({
        action: "update",
        displayName: s.displayName,
        webhookSecret: s.webhookSecret,
        feeType: "random",
        feeValue: 0,
        feeMin: min,
        feeMax: max,
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
      feeType: "random",
      enabledMerchants: data.settings.enabledMerchants ?? [],
      feeMin: data.settings.feeMin ?? min,
      feeMax: data.settings.feeMax ?? max,
    });
    setFeeMinStr(String(data.settings.feeMin ?? min));
    setFeeMaxStr(String(data.settings.feeMax ?? max));
    pushBubble({ title: "Pengaturan disimpan", tone: "ok" });
  }

  async function rotateKey() {
    if (!confirm("Generate API key baru? Key lama tidak bisa dipakai.")) return;
    setBusy(true);
    const res = await apiFetch("/api/settings", {
      method: "POST",
      body: JSON.stringify({ action: "rotate_api_key" }),
    });
    const data = await res.json();
    setBusy(false);
    if (res.ok) {
      setS((prev) => (prev ? { ...prev, apiKey: data.apiKey } : prev));
      pushBubble({ title: "API key baru dibuat", tone: "ok" });
    }
  }

  async function copy(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      pushBubble({ title: `${label} disalin`, tone: "info" });
    } catch {
      /* ignore */
    }
  }

  if (!s) {
    return (
      <section className="glass card-v2">
        <p className="muted">{err || "Memuat…"}</p>
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

      <section className="glass card-v2 anim-rise">
        <h2>QRIS statis · maks. 3</h2>
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
                {t.merchantCity ? ` · ${t.merchantCity}` : ""}
              </p>
            </div>
            <button
              type="button"
              className="btn btn-ghost btn-press"
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
              className="btn btn-block btn-press"
              disabled={scanning || busy}
              onClick={() => fileRef.current?.click()}
            >
              {scanning ? "Membaca QR…" : "Upload gambar QRIS"}
            </button>

            {preview ? (
              <div className="preview-box anim-pop">
                <p style={{ fontWeight: 600, color: "var(--ink)" }}>
                  {preview.merchantName}
                </p>
                <p className="muted">{preview.merchantCity || "—"}</p>
                <p
                  className="muted"
                  style={{
                    fontSize: 11,
                    fontFamily: "monospace",
                    wordBreak: "break-all",
                    marginTop: 8,
                  }}
                >
                  {preview.qrisString.slice(0, 80)}…
                </p>
                <button
                  type="button"
                  className="btn btn-block btn-press"
                  style={{ marginTop: 12 }}
                  disabled={busy}
                  onClick={saveStatic}
                >
                  Simpan QRIS
                </button>
                <button
                  type="button"
                  className="btn btn-block btn-ghost btn-press"
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

      <section className="glass card-v2 anim-rise">
        <h2>Sumber notifikasi</h2>
        <p className="muted" style={{ marginBottom: 8 }}>
          Pilih aplikasi sumber notifikasi di aplikasi listener Android
          (tombol <strong style={{ color: "var(--ink)" }}>Pilih sumber notifikasi</strong>).
        </p>
      </section>

      <section className="glass card-v2 anim-rise">
        <h2>Biaya admin & masa berlaku</h2>
        <p className="muted" style={{ marginBottom: 10 }}>
          Biaya admin selalu acak dalam rentang di bawah (anti-collision nominal).
        </p>
        <div style={{ display: "flex", gap: 8 }}>
          <div style={{ flex: 1 }}>
            <label className="muted" style={{ fontSize: 12 }}>Min (Rp)</label>
            <input
              className="input"
              style={{ width: "100%", marginTop: 4 }}
              type="text"
              inputMode="numeric"
              value={feeMinStr}
              onChange={(e) => setFeeMinStr(e.target.value.replace(/[^\d]/g, ""))}
              onBlur={() => {
                if (feeMinStr === "") setFeeMinStr("0");
              }}
            />
          </div>
          <div style={{ flex: 1 }}>
            <label className="muted" style={{ fontSize: 12 }}>Max (Rp)</label>
            <input
              className="input"
              style={{ width: "100%", marginTop: 4 }}
              type="text"
              inputMode="numeric"
              value={feeMaxStr}
              onChange={(e) => setFeeMaxStr(e.target.value.replace(/[^\d]/g, ""))}
              onBlur={() => {
                if (feeMaxStr === "") setFeeMaxStr("0");
              }}
            />
          </div>
        </div>
        <label className="muted" style={{ display: "block", marginTop: 14 }}>
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
          className="btn btn-block btn-press"
          style={{ marginTop: 12 }}
          disabled={busy}
          onClick={save}
        >
          Simpan
        </button>
      </section>

      <section className="glass card-v2 anim-rise">
        <h2>Nama tampilan</h2>
        <input
          className="input"
          style={{ width: "100%", marginTop: 8 }}
          value={s.displayName}
          onChange={(e) => setS({ ...s, displayName: e.target.value })}
        />
        <button
          type="button"
          className="btn btn-block btn-press"
          style={{ marginTop: 12 }}
          disabled={busy}
          onClick={save}
        >
          Simpan nama
        </button>
      </section>

      <section className="glass card-v2 anim-rise">
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
          className="btn btn-ghost btn-press"
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
          placeholder="Opsional · samakan dengan app listener"
          value={s.webhookSecret}
          onChange={(e) => setS({ ...s, webhookSecret: e.target.value })}
        />
        <button
          type="button"
          className="btn btn-block btn-press"
          style={{ marginTop: 10 }}
          disabled={busy}
          onClick={save}
        >
          Simpan secret
        </button>
      </section>

      <section className="glass card-v2 anim-rise">
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
            className="btn btn-ghost btn-press"
            onClick={() => copy(s.apiKey, "API key")}
          >
            Salin
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-press"
            disabled={busy}
            onClick={rotateKey}
          >
            Rotate
          </button>
        </div>
      </section>
    </>
  );
}

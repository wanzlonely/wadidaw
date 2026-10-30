"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { decodeQrisFromImage, sanitizePublicError } from "@/lib/decode-qris-image";
import { isLikelyQris, parseQrisMeta, type QrisMeta } from "@/lib/qris-convert";
import { apiFetch } from "@/lib/client-api";
import { pushBubble } from "@/components/BubbleToasts";
import { ConfirmModal } from "@/components/ConfirmModal";
import {
  IconAlert, IconCamera, IconUpload, IconCash, IconTag, IconLink,
  IconKey, IconCopy, IconRefresh, IconSpinner, IconQr,
} from "@/components/Icons";

type Settings = {
  displayName: string; apiKey: string; webhookSecret: string; feeType: "random";
  feeValue: number; feeMin: number; feeMax: number; defaultExpiryMinutes: number;
  enabledMerchants: string[]; updatedAt: string;
};
type StaticQris = {
  id: string; label: string; merchantName: string; merchantCity: string;
  packageHint?: string | null; createdAt: string;
};
type BusyKey = "fee" | "name" | "secret" | "qris" | "rotate" | null;

export function ProfileClient() {
  const [s, setS] = useState<Settings | null>(null);
  const [templates, setTemplates] = useState<StaticQris[]>([]);
  const [busy, setBusy] = useState<BusyKey>(null);
  const [scanning, setScanning] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [hookPath, setHookPath] = useState("");
  const [feeMinStr, setFeeMinStr] = useState("1");
  const [feeMaxStr, setFeeMaxStr] = useState("99");
  const [preview, setPreview] = useState<{ qrisString: string; meta: QrisMeta } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [rotateOpen, setRotateOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const [sRes, qRes] = await Promise.all([apiFetch("/api/settings"), apiFetch("/api/qris-static")]);
      const sData = await sRes.json();
      const qData = await qRes.json();
      if (!sRes.ok) { setErr(sanitizePublicError(sData.error || "Gagal memuat")); return; }
      setErr(null);
      const min = sData.settings.feeMin ?? 1;
      const max = sData.settings.feeMax ?? 99;
      setS({ ...sData.settings, feeType: "random", enabledMerchants: sData.settings.enabledMerchants ?? [], feeMin: min, feeMax: max });
      setFeeMinStr(String(min));
      setFeeMaxStr(String(max));
      setTemplates(qData.items ?? []);
    } catch (e) {
      setErr(sanitizePublicError(e instanceof Error ? e.message : "Gagal memuat"));
    }
  }, []);

  useEffect(() => {
    load();
    if (typeof window !== "undefined") setHookPath(`${window.location.origin}/api/webhook`);
  }, [load]);

  async function onPickImage(file: File | null) {
    if (!file) return;
    setScanning(true); setErr(null); setPreview(null);
    try {
      const raw = await decodeQrisFromImage(file);
      if (!isLikelyQris(raw)) throw new Error("QR terdeteksi tapi bukan QRIS yang valid");
      const meta = parseQrisMeta(raw);
      setPreview({ qrisString: raw, meta });
      pushBubble({ title: "QRIS terdeteksi", sub: meta.merchantName, tone: "info" });
    } catch (e) {
      const msg = sanitizePublicError(e instanceof Error ? e.message : String(e));
      setErr(msg);
      pushBubble({ title: "Gagal membaca QR", sub: msg, tone: "err" });
    } finally {
      setScanning(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function saveStatic() {
    if (!preview) return;
    setBusy("qris");
    try {
      const res = await apiFetch("/api/qris-static", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ qrisString: preview.qrisString, label: preview.meta.merchantName }),
      });
      const data = await res.json();
      if (!res.ok) {
        const msg = sanitizePublicError(data.error || "Gagal simpan QRIS");
        setErr(msg);
        pushBubble({ title: "Gagal simpan QRIS", sub: msg, tone: "err" });
        return;
      }
      setPreview(null);
      pushBubble({ title: "QRIS disimpan", sub: preview.meta.merchantName, tone: "ok" });
      load();
    } catch (e) {
      const msg = sanitizePublicError(e instanceof Error ? e.message : "Gagal simpan");
      setErr(msg);
      pushBubble({ title: "Gagal simpan QRIS", sub: msg, tone: "err" });
    } finally {
      setBusy(null);
    }
  }

  function requestDelete(id: string, name: string) {
    setDeleteTarget({ id, name });
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await apiFetch(`/api/qris-static?id=${encodeURIComponent(deleteTarget.id)}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        pushBubble({ title: "Gagal menghapus", sub: sanitizePublicError((data as { error?: string }).error || "Coba lagi"), tone: "err" });
        return;
      }
      pushBubble({ title: "QRIS dihapus", sub: "Sudah dihapus dari akun", tone: "info" });
      setDeleteTarget(null);
      load();
    } catch {
      pushBubble({ title: "Gagal menghapus", sub: "Periksa koneksi lalu coba lagi", tone: "err" });
    } finally {
      setDeleting(false);
    }
  }

  async function saveSettings(key: BusyKey, payload: Record<string, unknown>) {
    if (!s) return;
    setBusy(key); setErr(null);
    try {
      const res = await apiFetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update", ...payload }),
      });
      const data = await res.json();
      if (!res.ok) {
        const msg = sanitizePublicError(data.error || "Gagal simpan");
        setErr(msg);
        pushBubble({ title: "Gagal menyimpan", sub: msg, tone: "err" });
        return;
      }
      setS({ ...data.settings, feeType: "random", enabledMerchants: data.settings.enabledMerchants ?? [], feeMin: data.settings.feeMin ?? s.feeMin, feeMax: data.settings.feeMax ?? s.feeMax });
      setFeeMinStr(String(data.settings.feeMin ?? s.feeMin));
      setFeeMaxStr(String(data.settings.feeMax ?? s.feeMax));
      pushBubble({ title: "Perubahan disimpan", sub: "Pengaturan berhasil diperbarui", tone: "ok" });
    } catch {
      setErr("Koneksi gagal");
      pushBubble({ title: "Koneksi gagal", tone: "err" });
    } finally {
      setBusy(null);
    }
  }

  async function saveFee() {
    if (!s) return;
    const min = Math.max(0, Number(feeMinStr) || 0);
    const max = Math.max(min, Number(feeMaxStr) || 0);
    await saveSettings("fee", { displayName: s.displayName, webhookSecret: s.webhookSecret, feeType: "random", feeValue: 0, feeMin: min, feeMax: max, defaultExpiryMinutes: s.defaultExpiryMinutes, enabledMerchants: s.enabledMerchants });
  }
  async function saveName() {
    if (!s) return;
    await saveSettings("name", { displayName: s.displayName, webhookSecret: s.webhookSecret, feeType: "random", feeValue: 0, feeMin: s.feeMin, feeMax: s.feeMax, defaultExpiryMinutes: s.defaultExpiryMinutes, enabledMerchants: s.enabledMerchants });
  }
  async function saveSecret() {
    if (!s) return;
    await saveSettings("secret", { displayName: s.displayName, webhookSecret: s.webhookSecret, feeType: "random", feeValue: 0, feeMin: s.feeMin, feeMax: s.feeMax, defaultExpiryMinutes: s.defaultExpiryMinutes, enabledMerchants: s.enabledMerchants });
  }

  async function rotateKey() {
    setBusy("rotate");
    try {
      const res = await apiFetch("/api/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "rotate_api_key" }) });
      const data = await res.json();
      if (res.ok) {
        setS((prev) => (prev ? { ...prev, apiKey: data.apiKey } : prev));
        pushBubble({ title: "API key baru dibuat", sub: "Perubahan telah disimpan", tone: "ok" });
      } else {
        pushBubble({ title: "Gagal membuat key", sub: sanitizePublicError(data.error || "Coba lagi"), tone: "err" });
      }
    } finally {
      setBusy(null);
    }
  }

  async function copy(text: string, label: string) {
    try { await navigator.clipboard.writeText(text); pushBubble({ title: `${label} disalin`, tone: "info" }); } catch { /* ignore */ }
  }

  if (!s) {
    return (<section className="glass card-v2"><p className="muted">{err || "Memuat…"}</p></section>);
  }

  const m = preview?.meta;

  return (
    <div className="setel-v2">
      {err ? (
        <section className="glass card-v2 anim-shake">
          <p style={{ color: "var(--rose)", margin: 0 }}>
            <span className="inline-ico"><IconAlert size={15} /></span> {err}
          </p>
        </section>
      ) : null}

      <section className="glass card-v2 anim-rise">
        <h2><IconCamera size={16} /> QRIS statis · maks. 3</h2>
        <p className="muted" style={{ marginBottom: 12 }}>Upload foto QRIS dari galeri. String dan info dibaca otomatis.</p>
        {templates.map((t) => (
          <div key={t.id} className="list-item" style={{ marginTop: 10 }}>
            <span className="riwayat-ico" aria-hidden><IconQr size={18} /></span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, color: "var(--ink)" }}>{t.label || t.merchantName}</div>
              <p className="muted">{t.merchantName}{t.merchantCity ? ` · ${t.merchantCity}` : ""}</p>
            </div>
            <button type="button" className="btn btn-ghost btn-press" style={{ marginTop: 0 }} onClick={() => requestDelete(t.id, t.label || t.merchantName)}>
              Hapus
            </button>
          </div>
        ))}
        {templates.length < 3 ? (
          <div style={{ marginTop: 14 }}>
            <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => onPickImage(e.target.files?.[0] ?? null)} />
            <button type="button" className="btn btn-block btn-press" disabled={scanning || busy !== null} onClick={() => fileRef.current?.click()}>
              {scanning ? (<><IconSpinner size={15} /> Membaca QR…</>) : (<><IconUpload size={15} /> Upload gambar QRIS</>)}
            </button>
            {preview && m ? (
              <div className="preview-box anim-pop qris-info-panel">
                <h3 className="qris-info-title">QRIS Information</h3>
                <div className="qris-info-grid">
                  <div className="qris-info-row"><span>Merchant</span><strong>{m.merchantName || "-"}</strong></div>
                  <div className="qris-info-row"><span>City</span><strong>{m.merchantCity || "-"}</strong></div>
                  <div className="qris-info-row"><span>Issuer</span><strong>{m.issuer || "-"}</strong></div>
                  <div className="qris-info-row"><span>Method</span><strong>{m.method === "dynamic" ? "Dynamic" : "Static"}</strong></div>
                </div>
                <button type="button" className="btn btn-block btn-press" style={{ marginTop: 14 }} disabled={busy === "qris"} onClick={saveStatic}>
                  {busy === "qris" ? "Menyimpan…" : "Simpan QRIS"}
                </button>
                <button type="button" className="btn btn-block btn-ghost btn-press" style={{ marginTop: 8 }} disabled={busy === "qris"} onClick={() => setPreview(null)}>Batal</button>
              </div>
            ) : null}
          </div>
        ) : (
          <p className="muted" style={{ marginTop: 10 }}>Slot penuh (3/3)</p>
        )}
      </section>

      <section className="glass card-v2 anim-rise" style={{ animationDelay: "0.04s" }}>
        <h2><IconCash size={16} /> Biaya admin & masa berlaku</h2>
        <div style={{ display: "flex", gap: 8 }}>
          <div style={{ flex: 1 }}>
            <label className="muted" style={{ fontSize: 12 }}>Min (Rp)</label>
            <input className="input" style={{ width: "100%", marginTop: 4 }} type="text" inputMode="numeric" value={feeMinStr} onChange={(e) => setFeeMinStr(e.target.value.replace(/[^\d]/g, ""))} />
          </div>
          <div style={{ flex: 1 }}>
            <label className="muted" style={{ fontSize: 12 }}>Max (Rp)</label>
            <input className="input" style={{ width: "100%", marginTop: 4 }} type="text" inputMode="numeric" value={feeMaxStr} onChange={(e) => setFeeMaxStr(e.target.value.replace(/[^\d]/g, ""))} />
          </div>
        </div>
        <label className="muted" style={{ display: "block", marginTop: 14 }}>Default expired order</label>
        <select className="input" style={{ width: "100%", marginTop: 4 }} value={s.defaultExpiryMinutes} onChange={(e) => setS({ ...s, defaultExpiryMinutes: Number(e.target.value) })}>
          <option value={10}>10 menit</option>
          <option value={15}>15 menit</option>
          <option value={30}>30 menit</option>
          <option value={60}>60 menit</option>
          <option value={120}>2 jam</option>
        </select>
        <button type="button" className="btn btn-block btn-press" style={{ marginTop: 12 }} disabled={busy === "fee"} onClick={saveFee}>{busy === "fee" ? "Menyimpan…" : "Simpan"}</button>
      </section>

      <section className="glass card-v2 anim-rise" style={{ animationDelay: "0.08s" }}>
        <h2><IconTag size={16} /> Nama tampilan</h2>
        <input className="input" style={{ width: "100%", marginTop: 8 }} value={s.displayName} onChange={(e) => setS({ ...s, displayName: e.target.value })} />
        <button type="button" className="btn btn-block btn-press" style={{ marginTop: 12 }} disabled={busy === "name"} onClick={saveName}>{busy === "name" ? "Menyimpan…" : "Simpan nama"}</button>
      </section>

      <section className="glass card-v2 anim-rise" style={{ animationDelay: "0.12s" }}>
        <h2><IconLink size={16} /> Webhook HP</h2>
        <p className="muted" style={{ fontSize: 12, marginBottom: 4 }}>Tempel URL ini di aplikasi listener di HP kasir.</p>
        <div className="webhook-field">
          <span className="webhook-label">URL Webhook</span>
          <span className="webhook-url">{hookPath || "…"}</span>
        </div>
        <button type="button" className="btn btn-ghost btn-press" style={{ marginTop: 8 }} onClick={() => copy(hookPath, "Webhook URL")}>
          <IconCopy size={14} /> Salin URL lengkap
        </button>
        <label className="muted" style={{ display: "block", marginTop: 14 }}>Webhook secret</label>
        <input className="input" style={{ width: "100%", marginTop: 4 }} placeholder="Opsional" value={s.webhookSecret} onChange={(e) => setS({ ...s, webhookSecret: e.target.value })} />
        <button type="button" className="btn btn-block btn-press" style={{ marginTop: 10 }} disabled={busy === "secret"} onClick={saveSecret}>{busy === "secret" ? "Menyimpan…" : "Simpan secret"}</button>
      </section>

      <section className="glass card-v2 anim-rise" style={{ animationDelay: "0.16s" }}>
        <h2><IconKey size={16} /> API key</h2>
        <p className="muted" style={{ marginBottom: 8, fontSize: 12 }}>Pakai header <code>X-Api-Key</code> dari bot untuk buat pesanan.</p>
        <code className="code">{s.apiKey}</code>
        <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
          <button type="button" className="btn btn-ghost btn-press" onClick={() => copy(s.apiKey, "API key")}><IconCopy size={14} /> Salin</button>
          <button type="button" className="btn btn-ghost btn-press" disabled={busy === "rotate"} onClick={() => setRotateOpen(true)}>
            {busy === "rotate" ? <IconSpinner size={14} /> : <><IconRefresh size={14} /> Rotate</>}
          </button>
        </div>
      </section>

      <ConfirmModal
        open={Boolean(deleteTarget)}
        title="Hapus QRIS?"
        message={deleteTarget ? `QRIS “${deleteTarget.name}” akan dihapus dari akun Anda. Tindakan ini tidak bisa dibatalkan.` : ""}
        confirmLabel="Ya, hapus"
        cancelLabel="Batal"
        danger
        busy={deleting}
        onConfirm={confirmDelete}
        onCancel={() => { if (!deleting) setDeleteTarget(null); }}
      />
      <ConfirmModal
        open={rotateOpen}
        title="Buat API key baru?"
        message="Key lama tidak bisa dipakai lagi. Pastikan bot atau integrasi Anda diperbarui."
        confirmLabel="Ya, buat baru"
        cancelLabel="Batal"
        danger={false}
        busy={busy === "rotate"}
        onConfirm={async () => { setRotateOpen(false); await rotateKey(); }}
        onCancel={() => setRotateOpen(false)}
      />
    </div>
  );
}

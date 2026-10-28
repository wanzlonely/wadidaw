"use client";

import { useEffect, useMemo, useState } from "react";
import { formatRp, formatTime } from "@/lib/format";

type Payment = {
  id: string;
  merchantId: string;
  amount: number;
  paymentSource?: string | null;
  senderName?: string | null;
  rawTitle?: string | null;
  rawText?: string | null;
  receivedAt: string;
  forwardStatus?: string;
};

export function RiwayatClient() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [q, setQ] = useState("");
  const [merchant, setMerchant] = useState("all");
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/payments");
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Gagal load");
      return;
    }
    setError(null);
    setPayments(data.payments ?? []);
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 2000);
    return () => clearInterval(t);
  }, []);

  const filtered = useMemo(() => {
    return payments.filter((p) => {
      if (merchant !== "all" && p.merchantId !== merchant) return false;
      if (!q) return true;
      const s = `${p.merchantId} ${p.rawTitle} ${p.rawText} ${p.amount}`.toLowerCase();
      return s.includes(q.toLowerCase());
    });
  }, [payments, q, merchant]);

  const merchants = useMemo(() => {
    return Array.from(new Set(payments.map((p) => p.merchantId)));
  }, [payments]);

  function exportCsv() {
    const header = "id,amount,merchantId,paymentSource,receivedAt,rawTitle\n";
    const rows = filtered
      .map(
        (p) =>
          `${p.id},${p.amount},${p.merchantId},${p.paymentSource ?? ""},${p.receivedAt},"${(p.rawTitle ?? "").replace(/"/g, "'")}"`
      )
      .join("\n");
    const blob = new Blob([header + rows], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `walzpay-riwayat-${Date.now()}.csv`;
    a.click();
  }

  async function clearAll() {
    if (!confirm("Hapus semua riwayat di Redis?")) return;
    await fetch("/api/payments", { method: "DELETE" });
    load();
  }

  return (
    <>
      {error ? (
        <section className="glass">
          <p className="muted" style={{ color: "#ff8a80" }}>{error}</p>
        </section>
      ) : null}

      <section className="glass">
        <div className="form-row">
          <input
            className="input"
            placeholder="Cari nominal / teks…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <select
            className="input"
            value={merchant}
            onChange={(e) => setMerchant(e.target.value)}
          >
            <option value="all">Semua merchant</option>
            {merchants.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>
        <div className="form-row" style={{ marginTop: 10 }}>
          <button type="button" className="btn" onClick={exportCsv}>
            Export CSV
          </button>
          <button type="button" className="btn btn-ghost" onClick={clearAll}>
            Hapus semua
          </button>
        </div>
      </section>

      {filtered.length === 0 ? (
        <section className="glass">
          <p className="empty">Tidak ada data di Redis</p>
        </section>
      ) : (
        filtered.map((p) => (
          <section key={p.id} className="glass">
            <div className="list-item">
              <div>
                <div className="amount">{formatRp(p.amount)}</div>
                <p className="muted">
                  {p.merchantId}
                  {p.paymentSource ? ` · ${p.paymentSource}` : ""}
                  {p.forwardStatus ? ` · forward: ${p.forwardStatus}` : ""}
                </p>
                {p.senderName ? (
                  <p className="muted">Dari: {p.senderName}</p>
                ) : null}
                {p.rawTitle ? <p className="muted">{p.rawTitle}</p> : null}
                {p.rawText ? <p className="muted">{p.rawText}</p> : null}
                <p className="muted">{formatTime(p.receivedAt)}</p>
              </div>
            </div>
          </section>
        ))
      )}
    </>
  );
}

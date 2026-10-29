"use client";

import { useEffect, useMemo, useState } from "react";
import { formatRp, formatTime } from "@/lib/format";
import { apiFetch } from "@/lib/client-api";

type Order = {
  id: string;
  amount: number;
  totalAmount?: number;
  adminFee?: number;
  status: string;
  createdAt: string;
  paidAt?: string | null;
  expiresAt?: string | null;
  customerName?: string | null;
  note?: string | null;
  matchedPaymentId?: string | null;
};

type Payment = {
  id: string;
  merchantId: string;
  amount: number;
  paymentSource?: string | null;
  senderName?: string | null;
  rawTitle?: string | null;
  rawText?: string | null;
  receivedAt: string;
  matchedOrderId?: string | null;
};

function effectiveStatus(o: Order): string {
  if (o.status === "pending" && o.expiresAt) {
    if (new Date(o.expiresAt).getTime() <= Date.now()) return "expired";
  }
  return o.status;
}

function statusLabel(st: string) {
  if (st === "success") return "✅ Sukses";
  if (st === "pending") return "⏳ Menunggu";
  if (st === "expired") return "⌛ Kedaluwarsa";
  if (st === "cancelled") return "✕ Dibatalkan";
  return st;
}

function statusEmoji(st: string) {
  if (st === "success") return "✅";
  if (st === "pending") return "⏳";
  if (st === "expired") return "⌛";
  if (st === "cancelled") return "🚫";
  return "•";
}

export function RiwayatClient() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    const [oRes, pRes] = await Promise.all([
      apiFetch("/api/orders"),
      apiFetch("/api/payments"),
    ]);
    const oData = await oRes.json();
    const pData = await pRes.json();
    if (!oRes.ok) {
      setError(oData.error || "Gagal memuat data");
      return;
    }
    setError(null);
    setOrders(oData.orders ?? []);
    setPayments(pData.payments ?? []);
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, []);

  const filtered = useMemo(() => {
    return orders.filter((o) => {
      const st = effectiveStatus(o);
      if (statusFilter !== "all" && st !== statusFilter) return false;
      if (!q) return true;
      const s =
        `${o.id} ${o.amount} ${o.totalAmount} ${st} ${o.customerName ?? ""} ${o.note ?? ""}`.toLowerCase();
      return s.includes(q.toLowerCase());
    });
  }, [orders, q, statusFilter]);

  function exportCsv() {
    const header =
      "id,status,amount,totalAmount,adminFee,createdAt,paidAt,expiresAt\n";
    const rows = filtered
      .map((o) => {
        const st = effectiveStatus(o);
        return `${o.id},${st},${o.amount},${o.totalAmount ?? o.amount},${o.adminFee ?? 0},${o.createdAt},${o.paidAt ?? ""},${o.expiresAt ?? ""}`;
      })
      .join("\n");
    const blob = new Blob([header + rows], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `walzpay-riwayat-${Date.now()}.csv`;
    a.click();
  }

  async function refresh() {
    setBusy(true);
    await load();
    setBusy(false);
  }

  return (
    <div className="riwayat-v2">
      {error ? (
        <section className="glass card-v2 anim-shake">
          <p style={{ color: "var(--rose)", margin: 0 }}>⚠️ {error}</p>
        </section>
      ) : null}

      <section className="glass card-v2 anim-rise">
        <h2>🔍 Filter & ekspor</h2>
        <div className="form-row">
          <input
            className="input"
            placeholder="Cari nominal atau ID…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <select
            className="input"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">Semua</option>
            <option value="pending">Menunggu</option>
            <option value="success">Sukses</option>
            <option value="expired">Kedaluwarsa</option>
            <option value="cancelled">Dibatalkan</option>
          </select>
        </div>
        <div className="form-row" style={{ marginTop: 10 }}>
          <button type="button" className="btn btn-press" onClick={exportCsv}>
            📥 Export CSV
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-press"
            disabled={busy}
            onClick={refresh}
          >
            {busy ? "⏳ Memuat…" : "🔄 Refresh"}
          </button>
        </div>
      </section>

      <section className="glass card-v2 anim-rise" style={{ animationDelay: "0.05s" }}>
        <h2>📋 Transaksi · {filtered.length}</h2>
        {filtered.length === 0 ? (
          <p className="empty" style={{ marginTop: 12 }}>
            Belum ada transaksi
          </p>
        ) : (
          filtered.map((o, i) => {
            const st = effectiveStatus(o);
            return (
              <div
                key={o.id}
                className={`list-item riwayat-item anim-rise status-${st}`}
                style={{
                  marginTop: 10,
                  animationDelay: `${Math.min(i, 8) * 0.04}s`,
                }}
              >
                <span className="riwayat-ico" aria-hidden>
                  {statusEmoji(st)}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="amount sm">
                    {formatRp(o.totalAmount ?? o.amount)}
                  </div>
                  <p className="muted" style={{ fontSize: 12 }}>
                    Nominal {formatRp(o.amount)}
                    {(o.adminFee ?? 0) > 0
                      ? ` + admin ${formatRp(o.adminFee!)}`
                      : ""}
                  </p>
                  <p className="muted" style={{ fontSize: 11 }}>
                    {formatTime(o.createdAt)}
                    {o.paidAt ? ` · dibayar ${formatTime(o.paidAt)}` : ""}
                  </p>
                </div>
                <span className={`status-chip status-${st}`}>
                  {statusLabel(st)}
                </span>
              </div>
            );
          })
        )}
      </section>

      {payments.length > 0 ? (
        <section className="glass card-v2 anim-rise" style={{ animationDelay: "0.08s" }}>
          <h2>📲 Notifikasi masuk · {payments.length}</h2>
          {payments.slice(0, 30).map((p, i) => (
            <div
              key={p.id}
              className="list-item anim-rise"
              style={{
                marginTop: 10,
                animationDelay: `${Math.min(i, 6) * 0.03}s`,
              }}
            >
              <span className="riwayat-ico" aria-hidden>
                💸
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="amount sm">{formatRp(p.amount)}</div>
                <p className="muted" style={{ fontSize: 12 }}>
                  {p.merchantId}
                  {p.senderName ? ` · ${p.senderName}` : ""}
                </p>
                <p className="muted" style={{ fontSize: 11 }}>
                  {formatTime(p.receivedAt)}
                </p>
              </div>
            </div>
          ))}
        </section>
      ) : null}
    </div>
  );
}

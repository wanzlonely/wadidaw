"use client";

import { useEffect, useMemo, useState } from "react";
import { formatRp, formatTime } from "@/lib/format";

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

export function RiwayatClient() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    const [oRes, pRes] = await Promise.all([
      fetch("/api/orders"),
      fetch("/api/payments"),
    ]);
    const oData = await oRes.json();
    const pData = await pRes.json();
    if (!oRes.ok) {
      setError(oData.error || "Gagal load orders");
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
      if (statusFilter !== "all" && o.status !== statusFilter) return false;
      if (!q) return true;
      const s = `${o.id} ${o.amount} ${o.totalAmount} ${o.status} ${o.customerName ?? ""} ${o.note ?? ""}`.toLowerCase();
      return s.includes(q.toLowerCase());
    });
  }, [orders, q, statusFilter]);

  function exportCsv() {
    const header =
      "id,status,amount,totalAmount,adminFee,createdAt,paidAt,expiresAt\n";
    const rows = filtered
      .map(
        (o) =>
          `${o.id},${o.status},${o.amount},${o.totalAmount ?? o.amount},${o.adminFee ?? 0},${o.createdAt},${o.paidAt ?? ""},${o.expiresAt ?? ""}`
      )
      .join("\n");
    const blob = new Blob([header + rows], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `walzpay-riwayat-${Date.now()}.csv`;
    a.click();
  }

  async function clearAll() {
    if (!confirm("Hapus semua riwayat order & payment di Redis?")) return;
    setBusy(true);
    await Promise.all([
      fetch("/api/payments", { method: "DELETE" }),
      fetch("/api/orders?all=1", { method: "DELETE" }).catch(() => null),
    ]);
    setBusy(false);
    load();
  }

  async function purgeExpired() {
    setBusy(true);
    await fetch("/api/orders?status=pending");
    setBusy(false);
    load();
  }

  const statusColor = (st: string) => {
    if (st === "success") return "var(--mint)";
    if (st === "pending") return "#f0c674";
    if (st === "expired") return "var(--rose)";
    return "var(--muted)";
  };

  return (
    <>
      {error ? (
        <section className="glass">
          <p className="muted" style={{ color: "#ff8a80" }}>
            {error}
          </p>
        </section>
      ) : null}

      <section className="glass">
        <div className="form-row">
          <input
            className="input"
            placeholder="Cari nominal / id\u2026"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <select
            className="input"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">Semua status</option>
            <option value="pending">Pending</option>
            <option value="success">Sukses</option>
            <option value="expired">Expired</option>
            <option value="cancelled">Dibatalkan</option>
          </select>
        </div>
        <div className="form-row" style={{ marginTop: 10 }}>
          <button type="button" className="btn" onClick={exportCsv}>
            Export CSV
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            disabled={busy}
            onClick={purgeExpired}
          >
            Refresh
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            disabled={busy}
            onClick={clearAll}
          >
            Hapus semua
          </button>
        </div>
      </section>

      <section className="glass">
        <h2>Transaksi \u00b7 {filtered.length}</h2>
        {filtered.length === 0 ? (
          <p className="empty" style={{ marginTop: 12 }}>
            Tidak ada data
          </p>
        ) : (
          filtered.map((o) => (
            <div key={o.id} className="list-item" style={{ marginTop: 10 }}>
              <div style={{ flex: 1 }}>
                <div className="amount sm">
                  {formatRp(o.totalAmount ?? o.amount)}
                </div>
                <p className="muted" style={{ fontSize: 12 }}>
                  Base {formatRp(o.amount)}
                  {(o.adminFee ?? 0) > 0
                    ? ` + admin ${formatRp(o.adminFee!)}`
                    : ""}
                </p>
                <p className="muted" style={{ fontSize: 11 }}>
                  {formatTime(o.createdAt)}
                  {o.paidAt ? ` \u00b7 dibayar ${formatTime(o.paidAt)}` : ""}
                </p>
              </div>
              <span
                className="status-chip"
                style={{
                  color: statusColor(o.status),
                  borderColor: statusColor(o.status),
                  textTransform: "uppercase",
                  fontSize: 11,
                }}
              >
                {o.status}
              </span>
            </div>
          ))
        )}
      </section>

      {payments.length > 0 ? (
        <section className="glass">
          <h2>Notifikasi masuk \u00b7 {payments.length}</h2>
          {payments.slice(0, 30).map((p) => (
            <div key={p.id} className="list-item" style={{ marginTop: 10 }}>
              <div style={{ flex: 1 }}>
                <div className="amount sm">{formatRp(p.amount)}</div>
                <p className="muted" style={{ fontSize: 12 }}>
                  {p.merchantId}
                  {p.senderName ? ` \u00b7 ${p.senderName}` : ""}
                </p>
                <p className="muted" style={{ fontSize: 11 }}>
                  {formatTime(p.receivedAt)}
                </p>
              </div>
            </div>
          ))}
        </section>
      ) : null}
    </>
  );
}

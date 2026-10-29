"use client";

import { useEffect, useMemo, useState } from "react";
import { formatRp, formatTime } from "@/lib/format";
import { apiFetch } from "@/lib/client-api";
import {
  IconAlert, IconCheck, IconSpinner, IconRefresh, IconFilter, IconDownload, IconList, IconBell, IconCash,
} from "@/components/Icons";
import { Shell } from "@/components/Shell";

type Order = {
  id: string;
  amount: number;
  status: string;
  note?: string;
  createdAt: string;
  paidAt?: string;
};

type Payment = {
  id: string;
  amount: number;
  source?: string;
  createdAt: string;
};

function statusLabel(st: string) {
  if (st === "success") return "Sukses";
  if (st === "pending") return "Menunggu";
  if (st === "expired") return "Kedaluwarsa";
  if (st === "cancelled") return "Dibatalkan";
  return st;
}

function statusClass(st: string) {
  if (st === "success") return "ok";
  if (st === "pending") return "wait";
  if (st === "expired" || st === "cancelled") return "bad";
  return "";
}

export function RiwayatClient() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [filter, setFilter] = useState("all");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setBusy(true);
    setError(null);
    try {
      const [oRes, pRes] = await Promise.all([
        apiFetch("/api/orders"),
        apiFetch("/api/payments"),
      ]);
      const oData = await oRes.json();
      const pData = await pRes.json();
      if (!oRes.ok) {
        setError(oData.error || "Gagal memuat");
        return;
      }
      setOrders(oData.orders || []);
      setPayments(pData.payments || pData.items || []);
    } catch {
      setError("Koneksi gagal");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    if (filter === "all") return orders;
    return orders.filter((o) => o.status === filter);
  }, [orders, filter]);

  function exportCsv() {
    const rows = [
      ["id", "amount", "status", "createdAt", "paidAt", "note"].join(","),
      ...filtered.map((o) =>
        [o.id, o.amount, o.status, o.createdAt, o.paidAt || "", JSON.stringify(o.note || "")].join(",")
      ),
    ];
    const blob = new Blob([rows.join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `riwayat-${Date.now()}.csv`;
    a.click();
  }

  return (
    <Shell title="Riwayat" active="/riwayat">
      {error ? (
        <section className="glass card-v2">
          <p style={{ color: "var(--rose)", margin: 0 }}>
            <span className="inline-ico"><IconAlert size={15} /></span> {error}
          </p>
        </section>
      ) : null}

      <section className="glass card-v2 anim-rise">
        <h2>
          <IconFilter size={16} /> Filter & ekspor
        </h2>
        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          {(["all", "pending", "success", "expired", "cancelled"] as const).map((f) => (
            <button
              key={f}
              type="button"
              className={`btn btn-ghost btn-sm${filter === f ? " active-filter" : ""}`}
              onClick={() => setFilter(f)}
            >
              {f === "all" ? "Semua" : statusLabel(f)}
            </button>
          ))}
        </div>
        <div className="row" style={{ gap: 8, marginTop: 12 }}>
          <button type="button" className="btn btn-ghost btn-press" onClick={exportCsv}>
            <IconDownload size={14} /> Export CSV
          </button>
          <button type="button" className="btn btn-ghost btn-press" onClick={load} disabled={busy}>
            {busy ? (
              <>
                <IconSpinner size={14} /> Memuat…
              </>
            ) : (
              <>
                <IconRefresh size={14} /> Refresh
              </>
            )}
          </button>
        </div>
      </section>

      <section className="glass card-v2 anim-rise" style={{ animationDelay: "0.04s" }}>
        <h2>
          <IconList size={16} /> Transaksi · {filtered.length}
        </h2>
        {filtered.length === 0 ? (
          <p className="empty">Belum ada transaksi</p>
        ) : (
          <div className="list-v2">
            {filtered.map((o) => (
              <div key={o.id} className="list-row">
                <div className="list-main">
                  <strong>{formatRp(o.amount)}</strong>
                  <span className="muted">{formatTime(o.createdAt)}</span>
                </div>
                <span className={`status-chip ${statusClass(o.status)}`}>
                  {statusLabel(o.status)}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="glass card-v2 anim-rise" style={{ animationDelay: "0.08s" }}>
        <h2>
          <IconBell size={16} /> Notifikasi masuk · {payments.length}
        </h2>
        {payments.length === 0 ? (
          <p className="empty">Belum ada notifikasi pembayaran</p>
        ) : (
          <div className="list-v2">
            {payments.slice(0, 30).map((p) => (
              <div key={p.id} className="list-row">
                <div className="list-ico">
                  <IconCash size={18} />
                </div>
                <div className="list-main">
                  <strong>{formatRp(p.amount)}</strong>
                  <span className="muted">
                    {p.source || "e-wallet"} · {formatTime(p.createdAt)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </Shell>
  );
}

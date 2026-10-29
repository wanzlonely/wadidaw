"use client";

import { useCallback, useEffect, useState } from "react";
import { formatRp, formatTime } from "@/lib/format";

type Order = {
  id: string;
  amount: number;
  reference?: string | null;
  customerName?: string | null;
  note?: string | null;
  status: "pending" | "success" | "expired" | "cancelled";
  createdAt: string;
  paidAt?: string | null;
  matchedPaymentId?: string | null;
  expiresAt?: string | null;
};

export function OrdersClient() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [amount, setAmount] = useState("");
  const [customer, setCustomer] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/orders");
    const data = await res.json();
    if (!res.ok) {
      setErr(data.error || "Gagal load pesanan");
      return;
    }
    setErr(null);
    setOrders(data.orders ?? []);
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 2500);
    return () => clearInterval(t);
  }, [load]);

  async function create() {
    const n = Number(String(amount).replace(/\D/g, ""));
    if (!n || n <= 0) {
      setErr("Isi nominal valid");
      return;
    }
    setBusy(true);
    const res = await fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        amount: n,
        customerName: customer || null,
        note: note || null,
        expiresInMinutes: 60,
      }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setErr(data.error || "Gagal buat pesanan");
      return;
    }
    setAmount("");
    setCustomer("");
    setNote("");
    load();
  }

  async function cancel(id: string) {
    if (!confirm("Batalkan pesanan ini?")) return;
    await fetch(`/api/orders?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    load();
  }

  const pending = orders.filter((o) => o.status === "pending");

  return (
    <>
      {err ? (
        <section className="glass">
          <p style={{ color: "var(--rose)" }}>{err}</p>
        </section>
      ) : null}

      <section className="glass">
        <h2>Buat pesanan</h2>
        <p className="muted">
          Saat notifikasi masuk dengan nominal sama, status otomatis jadi{" "}
          <strong style={{ color: "var(--mint)" }}>success</strong>.
        </p>
        <input
          className="input"
          style={{ marginTop: 10, width: "100%" }}
          placeholder="Nominal (contoh 25000)"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          inputMode="numeric"
        />
        <input
          className="input"
          style={{ marginTop: 8, width: "100%" }}
          placeholder="Nama pelanggan (opsional)"
          value={customer}
          onChange={(e) => setCustomer(e.target.value)}
        />
        <input
          className="input"
          style={{ marginTop: 8, width: "100%" }}
          placeholder="Catatan (opsional)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <button type="button" className="btn btn-block" disabled={busy} onClick={create}>
          Buat pesanan pending
        </button>
      </section>

      <section className="glass">
        <h2>Menunggu bayar · {pending.length}</h2>
        {pending.length === 0 ? (
          <p className="empty">Tidak ada pesanan pending</p>
        ) : (
          pending.map((o) => (
            <div key={o.id} className="list-item" style={{ marginTop: 12 }}>
              <div>
                <div className="amount sm">{formatRp(o.amount)}</div>
                <p className="muted">
                  {o.customerName || "—"}
                  {o.note ? ` · ${o.note}` : ""}
                </p>
                <p className="muted">{formatTime(o.createdAt)}</p>
                <span className="status-chip pending">pending</span>
              </div>
              <button type="button" className="btn btn-ghost" style={{ marginTop: 0 }} onClick={() => cancel(o.id)}>
                Batal
              </button>
            </div>
          ))
        )}
      </section>

      <section className="glass">
        <h2>Riwayat pesanan</h2>
        {orders.filter((o) => o.status !== "pending").length === 0 ? (
          <p className="empty">Belum ada yang selesai</p>
        ) : (
          orders
            .filter((o) => o.status !== "pending")
            .slice(0, 30)
            .map((o) => (
              <div key={o.id} style={{ marginTop: 12 }}>
                <div className="amount sm">{formatRp(o.amount)}</div>
                <p className="muted">
                  {o.customerName || "—"} ·{" "}
                  <span className={`status-chip ${o.status}`}>{o.status}</span>
                </p>
                <p className="muted">
                  {o.paidAt ? formatTime(o.paidAt) : formatTime(o.createdAt)}
                </p>
              </div>
            ))
        )}
      </section>
    </>
  );
}

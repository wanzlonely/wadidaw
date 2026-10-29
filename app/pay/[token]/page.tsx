"use client";

import { useCallback, useEffect, useState } from "react";
import { formatRp, formatTime } from "@/lib/format";

type Order = {
  id: string;
  amount: number;
  uniqueCode: number;
  totalAmount: number;
  token: string;
  reference?: string | null;
  customerName?: string | null;
  note?: string | null;
  status: "pending" | "success" | "expired" | "cancelled";
  createdAt: string;
  paidAt?: string | null;
  expiresAt?: string | null;
  mode: "dynamic" | "static";
};

export default function PayPage({
  params,
}: {
  params: { token: string };
}) {
  const { token } = params;
  const [order, setOrder] = useState<Order | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/orders/by-token?token=${encodeURIComponent(token)}`);
      const data = await res.json();
      if (!res.ok) {
        setErr(data.error || "Pesanan tidak ditemukan");
        setOrder(null);
        return;
      }
      setErr(null);
      setOrder(data.order);
    } catch {
      setErr("Gagal memuat data");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
    const t = setInterval(() => {
      load();
    }, 2500);
    return () => clearInterval(t);
  }, [load]);

  async function copyAmount() {
    if (!order) return;
    const text = String(order.totalAmount);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  }

  if (loading) {
    return (
      <div className="pay-wrap">
        <div className="pay-card glass">
          <p className="muted">Memuat…</p>
        </div>
        <style jsx global>{payCss}</style>
      </div>
    );
  }

  if (err || !order) {
    return (
      <div className="pay-wrap">
        <div className="pay-card glass">
          <h1>Link tidak valid</h1>
          <p className="muted">{err || "Pesanan tidak ditemukan atau sudah dihapus."}</p>
        </div>
        <style jsx global>{payCss}</style>
      </div>
    );
  }

  const isPending = order.status === "pending";
  const isSuccess = order.status === "success";
  const isExpired =
    order.status === "expired" ||
    (order.expiresAt && new Date(order.expiresAt).getTime() < Date.now());

  return (
    <div className="pay-wrap">
      <div className="pay-card glass">
        <div className="pay-brand">WalzPay</div>
        <h1>
          {isSuccess
            ? "Pembayaran berhasil"
            : isExpired || order.status === "cancelled"
              ? "Pesanan berakhir"
              : "Bayar sekarang"}
        </h1>

        {order.customerName ? (
          <p className="muted" style={{ marginTop: 4 }}>
            Untuk: <strong style={{ color: "var(--ink)" }}>{order.customerName}</strong>
          </p>
        ) : null}
        {order.reference ? (
          <p className="muted">Ref: {order.reference}</p>
        ) : null}
        {order.note ? <p className="muted">{order.note}</p> : null}

        {isPending && !isExpired ? (
          <>
            <div className="pay-amount-block">
              <p className="muted" style={{ marginBottom: 6 }}>
                Transfer tepat sebesar
              </p>
              <div className="pay-total">{formatRp(order.totalAmount)}</div>
              {order.mode === "dynamic" && order.uniqueCode > 0 ? (
                <p className="pay-code-hint">
                  Nominal dasar {formatRp(order.amount)} + kode unik{" "}
                  <strong>{order.uniqueCode}</strong>
                </p>
              ) : null}
              <button type="button" className="btn btn-block" onClick={copyAmount}>
                {copied ? "Tersalin ✓" : "Salin nominal"}
              </button>
            </div>

            <div className="pay-steps">
              <p className="muted" style={{ marginBottom: 8 }}>
                Cara bayar (QRIS / transfer e-wallet):
              </p>
              <ol>
                <li>Buka aplikasi e-wallet atau mobile banking Anda</li>
                <li>
                  Transfer / bayar QRIS ke merchant dengan nominal{" "}
                  <strong>{formatRp(order.totalAmount)}</strong> (wajib tepat)
                </li>
                <li>Tunggu konfirmasi otomatis di halaman ini (biasanya &lt; 5 detik)</li>
              </ol>
            </div>

            {order.expiresAt ? (
              <p className="muted" style={{ marginTop: 16, fontSize: 13 }}>
                Berlaku sampai {formatTime(order.expiresAt)}
              </p>
            ) : null}

            <div className="pay-waiting">
              <span className="pulse" />
              Menunggu pembayaran…
            </div>
          </>
        ) : null}

        {isSuccess ? (
          <div className="pay-success">
            <div className="pay-check">✓</div>
            <p style={{ fontSize: 18, fontWeight: 600, marginTop: 12 }}>
              {formatRp(order.totalAmount)}
            </p>
            <p className="muted">
              Dibayar {order.paidAt ? formatTime(order.paidAt) : ""}
            </p>
          </div>
        ) : null}

        {(isExpired || order.status === "cancelled") && !isSuccess ? (
          <div style={{ marginTop: 24 }}>
            <p className="muted">
              Status: <span className={`status-chip ${order.status}`}>{order.status}</span>
            </p>
            <p className="muted" style={{ marginTop: 8 }}>
              Buat pesanan baru di dashboard merchant.
            </p>
          </div>
        ) : null}
      </div>
      <style jsx global>{payCss}</style>
    </div>
  );
}

const payCss = `
.pay-wrap {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px 16px;
  position: relative;
  z-index: 1;
}
.pay-card {
  width: 100%;
  max-width: 420px;
  padding: 28px 24px 32px;
}
.pay-brand {
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--aqua);
  margin-bottom: 12px;
}
.pay-card h1 {
  font-size: 1.45rem;
  font-weight: 700;
  line-height: 1.25;
}
.pay-amount-block {
  margin-top: 28px;
  text-align: center;
  padding: 20px 16px;
  border-radius: var(--radius-sm);
  background: rgba(255,255,255,0.06);
  border: 1px solid var(--line-soft);
}
.pay-total {
  font-size: 2rem;
  font-weight: 700;
  color: var(--mint);
  letter-spacing: -0.02em;
  margin-bottom: 6px;
}
.pay-code-hint {
  font-size: 13px;
  color: var(--ink-dim);
  margin-bottom: 14px;
}
.pay-steps {
  margin-top: 24px;
  font-size: 14px;
  line-height: 1.55;
  color: var(--ink-dim);
}
.pay-steps ol {
  padding-left: 18px;
}
.pay-steps li {
  margin-bottom: 6px;
}
.pay-waiting {
  margin-top: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  font-size: 14px;
  color: var(--amber);
}
.pulse {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--amber);
  animation: pulse 1.2s ease-in-out infinite;
}
@keyframes pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.4; transform: scale(0.85); }
}
.pay-success {
  margin-top: 32px;
  text-align: center;
}
.pay-check {
  width: 56px;
  height: 56px;
  margin: 0 auto;
  border-radius: 50%;
  background: rgba(126, 224, 200, 0.2);
  border: 2px solid var(--mint);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 28px;
  color: var(--mint);
}
`;

"use client";

import { useCallback, useEffect, useState } from "react";
import { formatRp, formatTime } from "@/lib/format";

type Order = {
  id: string;
  amount: number;
  uniqueCode?: number;
  totalAmount?: number;
  adminFee?: number;
  token?: string;
  customerName?: string | null;
  note?: string | null;
  status: string;
  createdAt: string;
  paidAt?: string | null;
  expiresAt?: string | null;
  mode?: string;
  qrisStaticId?: string | null;
  dynamicQris?: string | null;
};

type StaticQris = {
  id: string;
  label: string;
  merchantName: string;
  merchantCity: string;
};

function qrImageUrl(payload: string) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=280x280&margin=8&data=${encodeURIComponent(payload)}`;
}

function remainLabel(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function OrdersClient() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [templates, setTemplates] = useState<StaticQris[]>([]);
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [active, setActive] = useState<Order | null>(null);
  const [remainSec, setRemainSec] = useState<number | null>(null);

  const load = useCallback(async () => {
    const [oRes, qRes] = await Promise.all([
      fetch("/api/orders?status=pending"),
      fetch("/api/qris-static"),
    ]);
    const oData = await oRes.json();
    const qData = await qRes.json();
    if (!oRes.ok) {
      setErr(oData.error || "Gagal memuat");
      return;
    }
    setErr(null);
    const list: Order[] = oData.orders ?? [];
    setOrders(list);
    setTemplates(qData.items ?? []);

    if (active) {
      const fresh = list.find((o) => o.id === active.id);
      if (!fresh) {
        const allRes = await fetch("/api/orders");
        const allData = await allRes.json();
        const found = (allData.orders ?? []).find(
          (o: Order) => o.id === active.id
        );
        if (found?.status === "success") {
          setActive({ ...found });
        } else if (!found || found.status !== "pending") {
          setActive(null);
        }
      } else {
        setActive(fresh);
      }
    }
  }, [active]);

  useEffect(() => {
    load();
    const t = setInterval(load, 2500);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    if (!active?.expiresAt || active.status !== "pending") {
      setRemainSec(null);
      return;
    }
    const tick = () => {
      const left = Math.max(
        0,
        Math.floor((new Date(active.expiresAt!).getTime() - Date.now()) / 1000)
      );
      setRemainSec(left);
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [active?.expiresAt, active?.status, active?.id]);

  async function create() {
    const n = Number(String(amount).replace(/\D/g, ""));
    if (!n || n <= 0) {
      setErr("Masukkan nominal valid");
      return;
    }
    if (templates.length === 0) {
      setErr("Belum ada QRIS. Upload di halaman Profil dulu.");
      return;
    }
    setBusy(true);
    setErr(null);
    const res = await fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        amount: n,
        dynamic: true,
        qrisStaticId: templates[0].id,
      }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setErr(data.error || "Gagal membuat pesanan");
      return;
    }
    setAmount("");
    setActive(data.order);
    load();
  }

  async function cancel(id: string) {
    if (!confirm("Batalkan transaksi ini?")) return;
    setBusy(true);
    await fetch(`/api/orders?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    setBusy(false);
    if (active?.id === id) setActive(null);
    load();
  }

  const pending = orders.filter((o) => o.status === "pending");
  const showOrder =
    active && (active.status === "pending" || active.status === "success")
      ? active
      : pending[0] || null;

  return (
    <>
      {err ? (
        <section className="glass">
          <p style={{ color: "var(--rose)" }}>{err}</p>
        </section>
      ) : null}

      {templates.length === 0 ? (
        <section className="glass">
          <h2>Siapkan QRIS</h2>
          <p className="muted">
            Upload foto QRIS di halaman{" "}
            <strong style={{ color: "var(--ink)" }}>Profil</strong> terlebih
            dahulu. Setelah itu cukup masukkan nominal di sini.
          </p>
        </section>
      ) : (
        <section className="glass">
          <h2>Buat transaksi</h2>
          <p className="muted" style={{ marginBottom: 12 }}>
            {templates[0].merchantName}
            {templates[0].merchantCity
              ? ` · ${templates[0].merchantCity}`
              : ""}
          </p>
          <div className="amount-input-wrap">
            <span className="amount-prefix">Rp</span>
            <input
              className="input amount-input"
              placeholder="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ""))}
              inputMode="numeric"
              disabled={busy}
            />
          </div>
          <button
            type="button"
            className="btn btn-block"
            disabled={busy || !amount}
            onClick={create}
          >
            {busy ? "Membuat…" : "Generate QRIS"}
          </button>
        </section>
      )}

      {showOrder ? (
        <section
          className="glass qr-card"
          style={{
            borderColor:
              showOrder.status === "success"
                ? "rgba(126,224,200,0.45)"
                : undefined,
          }}
        >
          {showOrder.status === "success" ? (
            <>
              <div className="pay-success-block">
                <div className="pay-check">✓</div>
                <p className="amount" style={{ marginTop: 12 }}>
                  {formatRp(showOrder.totalAmount ?? showOrder.amount)}
                </p>
                <p className="muted">Pembayaran berhasil</p>
                {showOrder.paidAt ? (
                  <p className="muted">{formatTime(showOrder.paidAt)}</p>
                ) : null}
              </div>
              <button
                type="button"
                className="btn btn-block btn-ghost"
                onClick={() => setActive(null)}
              >
                Transaksi baru
              </button>
            </>
          ) : (
            <>
              <h2>QRIS dinamis</h2>
              <p className="amount" style={{ textAlign: "center" }}>
                {formatRp(showOrder.totalAmount ?? showOrder.amount)}
              </p>
              {showOrder.uniqueCode ? (
                <p
                  className="muted"
                  style={{ textAlign: "center", marginTop: 4 }}
                >
                  Base {formatRp(showOrder.amount)}
                  {showOrder.adminFee
                    ? ` + admin ${formatRp(showOrder.adminFee)}`
                    : ""}{" "}
                  + kode {showOrder.uniqueCode}
                </p>
              ) : null}

              {showOrder.dynamicQris ? (
                <div className="qr-frame">
                  <img
                    src={qrImageUrl(showOrder.dynamicQris)}
                    alt="QRIS dinamis"
                    width={260}
                    height={260}
                  />
                </div>
              ) : (
                <p className="empty">QR belum siap</p>
              )}

              <div className="expiry-row">
                {remainSec != null ? (
                  <span
                    className={remainSec < 60 ? "expiry urgent" : "expiry"}
                  >
                    Berlaku {remainLabel(remainSec)}
                  </span>
                ) : showOrder.expiresAt ? (
                  <span className="expiry">
                    Exp {formatTime(showOrder.expiresAt)}
                  </span>
                ) : null}
                <span className="status-chip pending">menunggu</span>
              </div>

              <div className="pay-waiting" style={{ marginTop: 14 }}>
                <span className="pulse" />
                Menunggu pembayaran…
              </div>

              <button
                type="button"
                className="btn btn-block btn-ghost"
                style={{ marginTop: 14 }}
                disabled={busy}
                onClick={() => cancel(showOrder.id)}
              >
                Batalkan transaksi
              </button>
            </>
          )}
        </section>
      ) : null}

      {pending.length > 1 ? (
        <section className="glass">
          <h2>Antrian · {pending.length}</h2>
          {pending.map((o) => (
            <div key={o.id} className="list-item" style={{ marginTop: 10 }}>
              <div style={{ flex: 1 }}>
                <div className="amount sm">
                  {formatRp(o.totalAmount ?? o.amount)}
                </div>
                <p className="muted">
                  {o.expiresAt ? `Exp ${formatTime(o.expiresAt)}` : "—"}
                </p>
              </div>
              <button
                type="button"
                className="btn btn-ghost"
                style={{ marginTop: 0, fontSize: 13 }}
                onClick={() => setActive(o)}
              >
                Lihat
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                style={{ marginTop: 0, fontSize: 13 }}
                onClick={() => cancel(o.id)}
              >
                Batal
              </button>
            </div>
          ))}
        </section>
      ) : null}
    </>
  );
}

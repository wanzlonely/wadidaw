"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { formatRp, formatTime } from "@/lib/format";
import { apiFetch } from "@/lib/client-api";
import { pushBubble } from "@/components/BubbleToasts";

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

/** High-contrast QR with error correction M for reliable e-wallet scans */
function qrImageUrl(payload: string) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=300x300&margin=10&ecc=M&data=${encodeURIComponent(payload)}`;
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
  const [cancelling, setCancelling] = useState(false);
  const activeIdRef = useRef<string | null>(null);

  const load = useCallback(async () => {
    const [oRes, qRes] = await Promise.all([
      apiFetch("/api/orders?status=pending"),
      apiFetch("/api/qris-static"),
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

    const id = activeIdRef.current;
    if (id) {
      const fresh = list.find((o) => o.id === id);
      if (fresh) {
        setActive(fresh);
      } else {
        const allRes = await apiFetch("/api/orders");
        const allData = await allRes.json();
        const found = (allData.orders ?? []).find((o: Order) => o.id === id);
        if (found?.status === "success") {
          setActive({ ...found });
        } else {
          setActive(null);
          activeIdRef.current = null;
        }
      }
    }
  }, []);

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
      const left = Math.floor(
        (new Date(active.expiresAt!).getTime() - Date.now()) / 1000
      );
      if (left <= 0) {
        setRemainSec(null);
        setActive(null);
        activeIdRef.current = null;
        load();
        return;
      }
      setRemainSec(left);
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [active?.expiresAt, active?.status, active?.id, load]);

  async function create() {
    const n = Number(String(amount).replace(/\D/g, ""));
    if (!n || n <= 0) {
      setErr("Masukkan nominal valid");
      pushBubble({ title: "Nominal tidak valid", tone: "err" });
      return;
    }
    if (templates.length === 0) {
      setErr("Belum ada QRIS. Upload di halaman Setel dulu.");
      pushBubble({
        title: "Belum ada QRIS",
        sub: "Upload di halaman Setel dulu",
        tone: "err",
      });
      return;
    }
    setBusy(true);
    setErr(null);
    setActive(null);
    activeIdRef.current = null;

    const res = await apiFetch("/api/orders", {
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
      pushBubble({
        title: "Gagal membuat pesanan",
        sub: data.error || "Coba lagi",
        tone: "err",
      });
      return;
    }
    setAmount("");
    const ord = data.order as Order;
    activeIdRef.current = ord.id;
    setActive(ord);
    pushBubble({
      title: "QRIS siap",
      sub: formatRp(ord.totalAmount ?? ord.amount),
      tone: "ok",
    });
    load();
  }

  async function cancel(id: string) {
    if (!confirm("Batalkan transaksi ini?")) return;
    setCancelling(true);
    setBusy(true);
    await apiFetch(`/api/orders?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    setBusy(false);
    pushBubble({ title: "Transaksi dibatalkan", tone: "info" });
    setTimeout(() => {
      setCancelling(false);
      if (activeIdRef.current === id) {
        setActive(null);
        activeIdRef.current = null;
      }
      load();
    }, 420);
  }

  const pending = orders.filter((o) => {
    if (o.status !== "pending") return false;
    if (!o.expiresAt) return true;
    return new Date(o.expiresAt).getTime() > Date.now();
  });

  const showOrder =
    active && (active.status === "pending" || active.status === "success")
      ? active
      : null;

  return (
    <>
      {err ? (
        <section className="glass card-v2 anim-shake">
          <p style={{ color: "var(--rose)" }}>{err}</p>
        </section>
      ) : null}

      {templates.length === 0 ? (
        <section className="glass card-v2 anim-rise">
          <h2>Siapkan QRIS</h2>
          <p className="muted">
            Upload gambar QRIS di halaman{" "}
            <strong style={{ color: "var(--ink)" }}>Setel</strong> terlebih
            dahulu. Setelah itu cukup masukkan nominal di sini.
          </p>
        </section>
      ) : (
        <section className="glass card-v2 anim-rise">
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
            className="btn btn-block btn-press"
            disabled={busy || !amount}
            onClick={create}
          >
            {busy ? "Membuat…" : "Generate QRIS"}
          </button>
        </section>
      )}

      {showOrder ? (
        <section
          className={`glass card-v2 qr-card ${cancelling ? "anim-cancel" : ""} ${showOrder.status === "success" ? "anim-success" : "anim-pop"}`}
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
                className="btn btn-block btn-ghost btn-press"
                onClick={() => {
                  setActive(null);
                  activeIdRef.current = null;
                }}
              >
                Transaksi baru
              </button>
            </>
          ) : (
            <>
              <h2>QRIS DINAMIS</h2>
              <p className="amount" style={{ textAlign: "center" }}>
                {formatRp(showOrder.totalAmount ?? showOrder.amount)}
              </p>
              {(showOrder.adminFee ?? 0) > 0 ? (
                <p className="muted" style={{ textAlign: "center", marginTop: 4 }}>
                  Nominal {formatRp(showOrder.amount)} + admin{" "}
                  {formatRp(showOrder.adminFee ?? 0)}
                </p>
              ) : null}

              {showOrder.dynamicQris ? (
                <div className="qr-frame">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={qrImageUrl(showOrder.dynamicQris)}
                    alt="QRIS dinamis"
                    width={280}
                    height={280}
                  />
                </div>
              ) : (
                <p className="empty">QR belum siap</p>
              )}

              <div className="expiry-row">
                {remainSec != null && remainSec > 0 ? (
                  <span className={remainSec < 60 ? "expiry urgent" : "expiry"}>
                    Berlaku {remainLabel(remainSec)}
                  </span>
                ) : null}
                <span className="status-chip pending">MENUNGGU</span>
              </div>

              <div className="pay-waiting" style={{ marginTop: 14 }}>
                <span className="pulse" />
                Menunggu pembayaran…
              </div>

              <button
                type="button"
                className="btn btn-block btn-ghost btn-press"
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

      {pending.length > 0 ? (
        <section className="glass card-v2 anim-rise">
          <h2>Antrian · {pending.length}</h2>
          {pending.map((o, i) => (
            <div
              key={o.id}
              className="list-item anim-rise"
              style={{ marginTop: 10, animationDelay: `${Math.min(i, 6) * 0.04}s` }}
            >
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
                className="btn btn-ghost btn-press"
                style={{ marginTop: 0, fontSize: 13 }}
                onClick={() => {
                  activeIdRef.current = o.id;
                  setActive(o);
                }}
              >
                Lihat
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-press"
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

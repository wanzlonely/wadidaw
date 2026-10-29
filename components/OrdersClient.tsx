"use client";

import { useCallback, useEffect, useState } from "react";
import { formatRp, formatTime } from "@/lib/format";
import { MERCHANTS } from "@/lib/merchants";

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
  packageHint?: string | null;
};

export function OrdersClient() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [templates, setTemplates] = useState<StaticQris[]>([]);
  const [amount, setAmount] = useState("");
  const [customer, setCustomer] = useState("");
  const [note, setNote] = useState("");
  const [expiresMin, setExpiresMin] = useState("30");
  const [adminFee, setAdminFee] = useState("");
  const [selectedQris, setSelectedQris] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [lastCreated, setLastCreated] = useState<Order | null>(null);
  const [qrisPaste, setQrisPaste] = useState("");
  const [qrisLabel, setQrisLabel] = useState("");
  const [qrisPkg, setQrisPkg] = useState("id.dana");

  const load = useCallback(async () => {
    const [oRes, qRes] = await Promise.all([
      fetch("/api/orders"),
      fetch("/api/qris-static"),
    ]);
    const oData = await oRes.json();
    const qData = await qRes.json();
    if (!oRes.ok) {
      setErr(oData.error || "Gagal load");
      return;
    }
    setErr(null);
    setOrders(oData.orders ?? []);
    const items: StaticQris[] = qData.items ?? [];
    setTemplates(items);
    if (items.length && !items.find((x) => x.id === selectedQris)) {
      setSelectedQris(items[0].id);
    }
  }, [selectedQris]);

  useEffect(() => {
    load();
    const t = setInterval(load, 2500);
    return () => clearInterval(t);
  }, [load]);

  async function saveStaticQris() {
    if (!qrisPaste.trim()) {
      setErr("Paste string QRIS statis (000201…)");
      return;
    }
    setBusy(true);
    const res = await fetch("/api/qris-static", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        qrisString: qrisPaste.trim(),
        label: qrisLabel || null,
        packageHint: qrisPkg || null,
      }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setErr(data.error || "Gagal simpan QRIS");
      return;
    }
    setQrisPaste("");
    setQrisLabel("");
    setSelectedQris(data.item.id);
    load();
  }

  async function deleteStatic(id: string) {
    if (!confirm("Hapus QRIS ini?")) return;
    await fetch(`/api/qris-static?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    if (selectedQris === id) setSelectedQris("");
    load();
  }

  async function create() {
    const n = Number(String(amount).replace(/\D/g, ""));
    if (!n || n <= 0) {
      setErr("Isi nominal valid");
      return;
    }
    if (templates.length > 0 && !selectedQris) {
      setErr("Pilih QRIS statis");
      return;
    }
    setBusy(true);
    setLastCreated(null);
    const feeRaw = Number(String(adminFee).replace(/\D/g, ""));
    const res = await fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        amount: n,
        customerName: customer || null,
        note: note || null,
        expiresInMinutes: Number(expiresMin) || 30,
        dynamic: true,
        qrisStaticId: selectedQris || null,
        adminFee: feeRaw > 0 ? feeRaw : undefined,
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
    setAdminFee("");
    setLastCreated(data.order);
    load();
  }

  async function cancel(id: string) {
    if (!confirm("Batalkan?")) return;
    await fetch(`/api/orders?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    load();
  }

  function paymentLink(o: Order) {
    if (typeof window === "undefined") return "";
    return `${window.location.origin}/pay/${o.token || o.id}`;
  }

  async function copyLink(o: Order) {
    try {
      await navigator.clipboard.writeText(paymentLink(o));
      setCopiedId(o.id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      /* ignore */
    }
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
        <h2>QRIS statis · maks. 3</h2>
        <p className="muted">
          Simpan payload QRIS sekali. Setiap pesanan diubah ke QRIS dinamis
          (nominal = base + kode unik + admin) agar transaksi bersamaan tidak bentrok.
        </p>
        {templates.map((t) => (
          <div key={t.id} className="list-item" style={{ marginTop: 12 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600 }}>{t.label}</div>
              <p className="muted">
                {t.merchantName}
                {t.merchantCity ? ` · ${t.merchantCity}` : ""}
              </p>
              <p className="muted" style={{ fontSize: 12 }}>
                Notifikasi: {t.packageHint || "—"}
              </p>
            </div>
            <button type="button" className="btn btn-ghost" style={{ marginTop: 0 }} onClick={() => deleteStatic(t.id)}>
              Hapus
            </button>
          </div>
        ))}
        {templates.length < 3 ? (
          <div style={{ marginTop: 14 }}>
            <input className="input" style={{ width: "100%" }} placeholder="Label (opsional)" value={qrisLabel} onChange={(e) => setQrisLabel(e.target.value)} />
            <textarea
              className="input"
              style={{ marginTop: 8, width: "100%", minHeight: 72, fontFamily: "monospace", fontSize: 12 }}
              placeholder="Paste string QRIS statis (000201…)"
              value={qrisPaste}
              onChange={(e) => setQrisPaste(e.target.value)}
            />
            <label className="muted" style={{ display: "block", marginTop: 8 }}>Sumber notifikasi (app di HP)</label>
            <select className="input" style={{ width: "100%", marginTop: 4 }} value={qrisPkg} onChange={(e) => setQrisPkg(e.target.value)}>
              {MERCHANTS.map((m) => (
                <option key={m.id} value={m.packages[0]}>
                  {m.name} · {m.packages[0]}
                </option>
              ))}
            </select>
            <button type="button" className="btn btn-block" disabled={busy} style={{ marginTop: 10 }} onClick={saveStaticQris}>
              Simpan QRIS statis
            </button>
          </div>
        ) : (
          <p className="muted" style={{ marginTop: 10 }}>Slot penuh (3/3)</p>
        )}
      </section>

      <section className="glass">
        <h2>Buat pesanan · dinamis + anti-collision</h2>
        <p className="muted">
          totalAmount = nominal + kode unik 3 digit + biaya admin. Matching webhook memakai total ini.
        </p>
        {templates.length === 0 ? (
          <p className="empty" style={{ marginTop: 10 }}>Simpan QRIS statis dulu.</p>
        ) : (
          <>
            <label className="muted" style={{ display: "block", marginTop: 10 }}>Template QRIS</label>
            <select className="input" style={{ width: "100%", marginTop: 4 }} value={selectedQris} onChange={(e) => setSelectedQris(e.target.value)}>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label} · {t.merchantName}
                </option>
              ))}
            </select>
            <input className="input" style={{ marginTop: 8, width: "100%" }} placeholder="Nominal dasar" value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="numeric" />
            <input className="input" style={{ marginTop: 8, width: "100%" }} placeholder="Biaya admin Rp (opsional)" value={adminFee} onChange={(e) => setAdminFee(e.target.value)} inputMode="numeric" />
            <input className="input" style={{ marginTop: 8, width: "100%" }} placeholder="Nama pelanggan" value={customer} onChange={(e) => setCustomer(e.target.value)} />
            <input className="input" style={{ marginTop: 8, width: "100%" }} placeholder="Catatan" value={note} onChange={(e) => setNote(e.target.value)} />
            <label className="muted" style={{ display: "block", marginTop: 8 }}>Berlaku</label>
            <select className="input" style={{ width: "100%", marginTop: 4 }} value={expiresMin} onChange={(e) => setExpiresMin(e.target.value)}>
              <option value="10">10 menit</option>
              <option value="15">15 menit</option>
              <option value="30">30 menit</option>
              <option value="60">60 menit</option>
              <option value="120">2 jam</option>
            </select>
            <button type="button" className="btn btn-block" disabled={busy} style={{ marginTop: 10 }} onClick={create}>
              Buat pesanan + QRIS dinamis
            </button>
          </>
        )}
      </section>

      {lastCreated ? (
        <section className="glass" style={{ borderColor: "rgba(126,224,200,0.35)" }}>
          <h2 style={{ color: "var(--mint)" }}>Siap dibayar</h2>
          <p className="muted" style={{ marginTop: 6 }}>
            Base {formatRp(lastCreated.amount)}
            {lastCreated.uniqueCode ? <> + kode <strong>{lastCreated.uniqueCode}</strong></> : null}
            {lastCreated.adminFee ? <> + admin <strong>{formatRp(lastCreated.adminFee)}</strong></> : null}
            {" = "}
            <strong style={{ color: "var(--mint)" }}>{formatRp(lastCreated.totalAmount ?? lastCreated.amount)}</strong>
          </p>
          {lastCreated.expiresAt ? <p className="muted">Exp {formatTime(lastCreated.expiresAt)}</p> : null}
          <button type="button" className="btn btn-block" style={{ marginTop: 10 }} onClick={() => copyLink(lastCreated)}>
            {copiedId === lastCreated.id ? "Tersalin ✓" : "Salin payment link"}
          </button>
        </section>
      ) : null}

      <section className="glass">
        <h2>Menunggu · {pending.length}</h2>
        {pending.length === 0 ? (
          <p className="empty">Kosong</p>
        ) : (
          pending.map((o) => (
            <div key={o.id} className="list-item" style={{ marginTop: 12 }}>
              <div style={{ flex: 1 }}>
                <div className="amount sm">
                  {formatRp(o.totalAmount ?? o.amount)}
                  {o.uniqueCode ? (
                    <span className="muted" style={{ fontSize: 12, fontWeight: 400 }}>
                      {" "}(base {formatRp(o.amount)}{o.adminFee ? ` +adm ${o.adminFee}` : ""} +{o.uniqueCode})
                    </span>
                  ) : null}
                </div>
                <p className="muted">{o.customerName || "—"}{o.expiresAt ? ` · exp ${formatTime(o.expiresAt)}` : ""}</p>
                <span className="status-chip pending">pending</span>
                <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button type="button" className="btn btn-ghost" style={{ marginTop: 0, fontSize: 13 }} onClick={() => copyLink(o)}>
                    {copiedId === o.id ? "Tersalin ✓" : "Link"}
                  </button>
                  <button type="button" className="btn btn-ghost" style={{ marginTop: 0, fontSize: 13 }} onClick={() => cancel(o.id)}>
                    Batal
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </section>

      <section className="glass">
        <h2>Riwayat</h2>
        {orders.filter((o) => o.status !== "pending").length === 0 ? (
          <p className="empty">Belum ada</p>
        ) : (
          orders
            .filter((o) => o.status !== "pending")
            .slice(0, 30)
            .map((o) => (
              <div key={o.id} style={{ marginTop: 12 }}>
                <div className="amount sm">{formatRp(o.totalAmount ?? o.amount)}</div>
                <p className="muted">
                  {o.customerName || "—"} · <span className={`status-chip ${o.status}`}>{o.status}</span>
                </p>
              </div>
            ))
        )}
      </section>
    </>
  );
}

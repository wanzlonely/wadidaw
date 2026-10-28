"use client";

import { useCallback, useEffect, useState } from "react";
import { MERCHANTS } from "@/lib/merchants";
import { formatRp, formatTime } from "@/lib/format";

type Payment = {
  id: string;
  merchantId: string;
  amount: number;
  paymentSource?: string | null;
  receivedAt: string;
  forwardStatus?: string;
};

type Stats = {
  count: number;
  totalAmount: number;
  todayCount: number;
  todayAmount: number;
  latest: Payment | null;
};

type Forward = { id: string; url: string; enabled: boolean };

const LS_MERCHANTS = "walzpay_merchants";
const LS_SOUND = "walzpay_sound";

export function Dashboard() {
  const [active, setActive] = useState(true);
  const [stats, setStats] = useState<Stats | null>(null);
  const [forwards, setForwards] = useState<Forward[]>([]);
  const [url, setUrl] = useState("");
  const [merchants, setMerchants] = useState<Record<string, boolean>>({});
  const [sound, setSound] = useState(true);
  const [hookPath, setHookPath] = useState("/api/webhook");
  const [busy, setBusy] = useState(false);
  const [lastCount, setLastCount] = useState(0);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setHookPath(`${window.location.origin}/api/webhook`);
      try {
        const m = localStorage.getItem(LS_MERCHANTS);
        setMerchants(m ? JSON.parse(m) : { dana: true });
        setSound(localStorage.getItem(LS_SOUND) !== "0");
      } catch {
        setMerchants({ dana: true });
      }
    }
  }, []);

  const refresh = useCallback(async () => {
    const [pRes, sRes, fRes] = await Promise.all([
      fetch("/api/payments").then((r) => r.json()),
      fetch("/api/service").then((r) => r.json()),
      fetch("/api/forwards").then((r) => r.json()),
    ]);
    setStats(pRes.stats);
    setActive(Boolean(sRes.active));
    setForwards(fRes.forwards ?? []);

    const count = pRes.stats?.count ?? 0;
    if (sound && lastCount > 0 && count > lastCount) {
      try {
        const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.connect(g);
        g.connect(ctx.destination);
        o.frequency.value = 880;
        g.gain.value = 0.08;
        o.start();
        setTimeout(() => o.stop(), 180);
      } catch {
        /* ignore */
      }
    }
    setLastCount(count);
  }, [sound, lastCount]);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 4000);
    return () => clearInterval(t);
  }, [refresh]);

  async function toggleService() {
    setBusy(true);
    await fetch("/api/service", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !active }),
    });
    setBusy(false);
    refresh();
  }

  async function addForward() {
    if (!url.trim()) return;
    setBusy(true);
    await fetch("/api/forwards", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });
    setUrl("");
    setBusy(false);
    refresh();
  }

  async function removeForward(id: string) {
    await fetch(`/api/forwards?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    refresh();
  }

  async function testPay() {
    setBusy(true);
    await fetch("/api/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount: 10000, merchantId: "dana" }),
    });
    setBusy(false);
    refresh();
  }

  function toggleMerchant(id: string) {
    const next = { ...merchants, [id]: !merchants[id] };
    setMerchants(next);
    localStorage.setItem(LS_MERCHANTS, JSON.stringify(next));
  }

  function toggleSound() {
    const v = !sound;
    setSound(v);
    localStorage.setItem(LS_SOUND, v ? "1" : "0");
  }

  async function copyHook() {
    try {
      await navigator.clipboard.writeText(hookPath);
      alert("URL webhook disalin");
    } catch {
      prompt("Salin URL:", hookPath);
    }
  }

  return (
    <>
      <section className="glass">
        <h2>Akses notifikasi (di HP)</h2>
        <p>
          Website tidak membaca notifikasi Android. Pasang app listener (QRIS
          Hook), izinkan akses notifikasi, lalu set webhook ke URL di bawah.
        </p>
        <code className="code">{hookPath}</code>
        <button type="button" className="btn" onClick={copyHook}>
          Salin URL webhook
        </button>
      </section>

      <section className="glass row">
        <div>
          <h2>WALZPAY Aktif</h2>
          <p>
            {active
              ? "Menerima event webhook"
              : "Dijeda — webhook ditolak (503)"}
          </p>
        </div>
        <label className="switch">
          <input
            type="checkbox"
            checked={active}
            disabled={busy}
            onChange={toggleService}
          />
          <span className="slider" />
        </label>
      </section>

      <section className="glass">
        <h2>Statistik hari ini</h2>
        <div className="stats-grid">
          <div>
            <p className="muted">Hari ini</p>
            <p className="amount">{stats?.todayCount ?? 0}</p>
          </div>
          <div>
            <p className="muted">Nominal hari ini</p>
            <p className="amount">{formatRp(stats?.todayAmount ?? 0)}</p>
          </div>
          <div>
            <p className="muted">Total semua</p>
            <p className="amount">{stats?.count ?? 0}</p>
          </div>
          <div>
            <p className="muted">Nominal total</p>
            <p className="amount">{formatRp(stats?.totalAmount ?? 0)}</p>
          </div>
        </div>
      </section>

      <section className="glass">
        <h2>Pembayaran terakhir</h2>
        {stats?.latest ? (
          <div>
            <p className="amount">{formatRp(stats.latest.amount)}</p>
            <p className="muted">
              {stats.latest.merchantId}
              {stats.latest.paymentSource
                ? ` · ${stats.latest.paymentSource}`
                : ""}
            </p>
            <p className="muted">{formatTime(stats.latest.receivedAt)}</p>
          </div>
        ) : (
          <p className="empty">Belum ada data</p>
        )}
        <button type="button" className="btn" disabled={busy} onClick={testPay}>
          Simulasi pembayaran Rp10.000
        </button>
      </section>

      <section className="glass">
        <h2>Webhook lanjutan (forward)</h2>
        <p>
          Setelah event masuk ke WALZPAY, forward ke URL lain (server kasir,
          Discord, n8n, dll.).
        </p>
        <div className="form-row">
          <input
            className="input"
            placeholder="https://example.com/hook"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
          <button type="button" className="btn" disabled={busy} onClick={addForward}>
            + Tambah
          </button>
        </div>
        {forwards.length === 0 ? (
          <p className="muted" style={{ marginTop: 10 }}>
            Belum ada forward URL
          </p>
        ) : (
          forwards.map((f) => (
            <div key={f.id} className="list-item" style={{ marginTop: 10 }}>
              <code className="code" style={{ flex: 1, marginTop: 0 }}>
                {f.url}
              </code>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => removeForward(f.id)}
              >
                Hapus
              </button>
            </div>
          ))
        )}
      </section>

      <section className="glass">
        <h2>Merchant (panduan filter di HP)</h2>
        <p className="muted">
          Centang merchant yang kamu pantau di app listener. Preferensi disimpan
          di browser ini.
        </p>
        {MERCHANTS.map((m) => (
          <label key={m.id} className="check-row">
            <input
              type="checkbox"
              checked={Boolean(merchants[m.id])}
              onChange={() => toggleMerchant(m.id)}
            />
            <span>
              <strong>{m.name}</strong>
              <br />
              <span className="muted">{m.packages.join(", ")}</span>
            </span>
          </label>
        ))}
      </section>

      <section className="glass row">
        <div>
          <h2>Suara saat pembayaran baru</h2>
          <p>Bunyi singkat di tab browser (auto-refresh 4 dtk)</p>
        </div>
        <label className="switch">
          <input type="checkbox" checked={sound} onChange={toggleSound} />
          <span className="slider" />
        </label>
      </section>
    </>
  );
}

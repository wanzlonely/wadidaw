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

export function Dashboard({ onRedis }: { onRedis?: (v: boolean | null) => void }) {
  const [active, setActive] = useState(true);
  const [stats, setStats] = useState<Stats | null>(null);
  const [forwards, setForwards] = useState<Forward[]>([]);
  const [url, setUrl] = useState("");
  const [merchants, setMerchants] = useState<Record<string, boolean>>({});
  const [sound, setSound] = useState(true);
  const [hookPath, setHookPath] = useState("/api/webhook");
  const [busy, setBusy] = useState(false);
  const [lastCount, setLastCount] = useState(0);
  const [redisOk, setRedisOk] = useState<boolean | null>(null);
  const [err, setErr] = useState<string | null>(null);

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
    try {
      const [pRes, sRes, fRes, hRes] = await Promise.all([
        fetch("/api/payments").then(async (r) => ({ ok: r.ok, data: await r.json() })),
        fetch("/api/service").then(async (r) => ({ ok: r.ok, data: await r.json() })),
        fetch("/api/forwards").then(async (r) => ({ ok: r.ok, data: await r.json() })),
        fetch("/api/health").then(async (r) => ({ ok: r.ok, data: await r.json() })),
      ]);

      const rok = Boolean(hRes.data?.redis && hRes.data?.ok);
      setRedisOk(rok);
      onRedis?.(rok);

      if (!pRes.ok) {
        setErr(pRes.data?.error || "Gagal memuat data");
        return;
      }
      setErr(null);
      setStats(pRes.data.stats);
      setActive(Boolean(sRes.data?.active));
      setForwards(fRes.data?.forwards ?? []);

      const count = pRes.data.stats?.count ?? 0;
      if (sound && lastCount > 0 && count > lastCount) {
        try {
          const AC =
            window.AudioContext ||
            (window as unknown as { webkitAudioContext: typeof AudioContext })
              .webkitAudioContext;
          const ctx = new AC();
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
    } catch (e) {
      setErr(String(e));
      onRedis?.(false);
    }
  }, [sound, lastCount, onRedis]);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 2000);
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
    await fetch(`/api/forwards?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    refresh();
  }

  async function testPay() {
    setBusy(true);
    const res = await fetch("/api/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount: 10000, merchantId: "dana" }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setErr(j.error || "Gagal kirim uji");
    }
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
      {err ? (
        <section className="glass">
          <h2>Error</h2>
          <p style={{ color: "var(--danger)" }}>{err}</p>
        </section>
      ) : null}

      <section className="glass">
        <div className="hero-amount">
          <p className="label">Masuk hari ini</p>
          <p className="amount">{formatRp(stats?.todayAmount ?? 0)}</p>
          <p className="muted" style={{ marginTop: 6 }}>
            {stats?.todayCount ?? 0} transaksi · total semua {formatRp(stats?.totalAmount ?? 0)}
          </p>
        </div>
        <hr className="divider" />
        <div className="stats-grid">
          <div className="stat-box">
            <p className="label">Hari ini</p>
            <p className="amount sm">{stats?.todayCount ?? 0}</p>
          </div>
          <div className="stat-box">
            <p className="label">Semua</p>
            <p className="amount sm">{stats?.count ?? 0}</p>
          </div>
        </div>
      </section>

      <section className="glass row">
        <div>
          <h2 style={{ marginBottom: 4 }}>Layanan aktif</h2>
          <p>{active ? "Menerima webhook" : "Dijeda"}</p>
        </div>
        <label className="switch">
          <input type="checkbox" checked={active} disabled={busy} onChange={toggleService} />
          <span className="slider" />
        </label>
      </section>

      <section className="glass">
        <h2>Pembayaran terakhir</h2>
        {stats?.latest ? (
          <div>
            <p className="amount">{formatRp(stats.latest.amount)}</p>
            <p className="muted" style={{ marginTop: 4 }}>
              {stats.latest.merchantId}
              {stats.latest.paymentSource ? ` · ${stats.latest.paymentSource}` : ""}
            </p>
            <p className="muted">{formatTime(stats.latest.receivedAt)}</p>
          </div>
        ) : (
          <p className="empty">Belum ada data — tekan uji atau tunggu notifikasi dari HP</p>
        )}
        <button type="button" className="btn btn-block" disabled={busy} onClick={testPay}>
          Kirim uji Rp10.000
        </button>
      </section>

      <section className="glass">
        <h2>Webhook HP</h2>
        <p>Tempel di QRIS Hook sebagai URL tujuan.</p>
        <code className="code">{hookPath}</code>
        <button type="button" className="btn btn-block" onClick={copyHook}>
          Salin URL
        </button>
      </section>

      <section className="glass">
        <h2>Forward URL</h2>
        <p>Setelah ke Redis, teruskan ke kasir / n8n / Discord.</p>
        <div className="form-row" style={{ marginTop: 8 }}>
          <input
            className="input"
            placeholder="https://…"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
          <button type="button" className="btn" style={{ marginTop: 0 }} disabled={busy} onClick={addForward}>
            + Tambah
          </button>
        </div>
        {forwards.map((f) => (
          <div key={f.id} className="list-item" style={{ marginTop: 10 }}>
            <code className="code" style={{ flex: 1, marginTop: 0 }}>
              {f.url}
            </code>
            <button type="button" className="btn btn-ghost" style={{ marginTop: 0 }} onClick={() => removeForward(f.id)}>
              Hapus
            </button>
          </div>
        ))}
      </section>

      <section className="glass">
        <h2>Merchant di HP</h2>
        <p className="muted">Aktifkan package yang sama di QRIS Hook.</p>
        {MERCHANTS.map((m) => (
          <label key={m.id} className="check-row">
            <input
              type="checkbox"
              checked={Boolean(merchants[m.id])}
              onChange={() => toggleMerchant(m.id)}
            />
            <span>
              <strong style={{ color: "var(--text)" }}>{m.name}</strong>
              <br />
              <span className="muted" style={{ fontSize: "0.75rem" }}>
                {m.packages.join(", ")}
              </span>
            </span>
          </label>
        ))}
      </section>

      <section className="glass row">
        <div>
          <h2 style={{ marginBottom: 4 }}>Suara alert</h2>
          <p>Saat data baru dari Redis</p>
        </div>
        <label className="switch">
          <input type="checkbox" checked={sound} onChange={toggleSound} />
          <span className="slider" />
        </label>
      </section>
    </>
  );
}

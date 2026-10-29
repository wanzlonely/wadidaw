"use client";

import { useCallback, useEffect, useState } from "react";
import { formatRp, formatTime } from "@/lib/format";
import { apiFetch, setStoredToken } from "@/lib/api";
import { pushBubble } from "@/components/BubbleToasts";
import { androidCall, isWalzApp } from "@/lib/walz-android";

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
  pendingOrders?: number;
  successOrders?: number;
};

type Forward = { id: string; url: string; enabled: boolean };
type WeekDay = { key: string; label: string; count: number; amount: number };

const LS_SOUND = "walzpay_sound";
const LS_PUSH = "walzpay_push";

export function Dashboard({ onRedis }: { onRedis?: (v: boolean | null) => void }) {
  const [active, setActive] = useState(true);
  const [stats, setStats] = useState<Stats | null>(null);
  const [pendingLive, setPendingLive] = useState(0);
  const [successLive, setSuccessLive] = useState(0);
  const [forwards, setForwards] = useState<Forward[]>([]);
  const [week, setWeek] = useState<WeekDay[]>([]);
  const [url, setUrl] = useState("");
  const [sound, setSound] = useState(true);
  const [pushOn, setPushOn] = useState(false);
  const [hookPath, setHookPath] = useState("/api/webhook");
  const [busy, setBusy] = useState(false);
  const [lastCount, setLastCount] = useState(0);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setHookPath(`${window.location.origin}/api/webhook`);
      try {
        setSound(localStorage.getItem(LS_SOUND) !== "0");
        setPushOn(localStorage.getItem(LS_PUSH) === "1");
      } catch {
        /* ignore */
      }
    }
  }, []);

  function playBeep() {
    try {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
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

  function browserNotify(title: string, body: string) {
    if (!pushOn) return;
    if (typeof Notification === "undefined") return;
    if (Notification.permission === "granted") {
      try {
        new Notification(title, { body, icon: "/icon-192.png" });
      } catch {
        /* ignore */
      }
    }
  }

  const refresh = useCallback(async () => {
    try {
      const [pRes, sRes, fRes, hRes, wRes, oRes, oAllRes] = await Promise.all([
        apiFetch("/api/payments").then(async (r) => ({ ok: r.ok, data: await r.json() })),
        apiFetch("/api/service").then(async (r) => ({ ok: r.ok, data: await r.json() })),
        apiFetch("/api/forwards").then(async (r) => ({ ok: r.ok, data: await r.json() })),
        apiFetch("/api/health").then(async (r) => ({ ok: r.ok, data: await r.json() })),
        apiFetch("/api/stats/week").then(async (r) => ({ ok: r.ok, data: await r.json() })),
        apiFetch("/api/orders?status=pending").then(async (r) => ({ ok: r.ok, data: await r.json() })),
        apiFetch("/api/orders").then(async (r) => ({ ok: r.ok, data: await r.json() })),
      ]);

      const rok = Boolean(hRes.data?.redis && hRes.data?.ok);
      onRedis?.(rok);

      if (!pRes.ok) {
        const msg = String(pRes.data?.error || "Gagal memuat data");
        if (/login|belum login|sesi/i.test(msg)) {
          setStoredToken(null);
          window.location.replace("/login");
          return;
        }
        setErr(msg);
        return;
      }
      setErr(null);
      setStats(pRes.data.stats);
      setActive(Boolean(sRes.data?.active));
      setForwards(fRes.data?.forwards ?? []);
      if (wRes.ok) setWeek(wRes.data.days ?? []);

      const now = Date.now();
      const pendingList = (oRes.data?.orders ?? []) as { status: string; expiresAt?: string | null }[];
      const live = pendingList.filter((o) => {
        if (o.status !== "pending") return false;
        if (o.expiresAt && new Date(o.expiresAt).getTime() <= now) return false;
        return true;
      }).length;
      setPendingLive(live);

      const allOrders = (oAllRes.data?.orders ?? []) as { status: string }[];
      setSuccessLive(allOrders.filter((o) => o.status === "success").length);

      const count = pRes.data.stats?.count ?? 0;
      const latest: Payment | null = pRes.data.stats?.latest ?? null;
      if (lastCount > 0 && count > lastCount && latest) {
        const title = `Pembayaran ${formatRp(latest.amount)}`;
        const sub = `${latest.merchantId}${latest.paymentSource ? " · " + latest.paymentSource : ""}`;
        pushBubble({ title, sub, tone: "ok" });
        if (sound) playBeep();
        browserNotify(title, sub);
      }
      setLastCount(count);
    } catch (e) {
      setErr(String(e));
      onRedis?.(false);
    }
  }, [sound, pushOn, lastCount, onRedis]);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 2000);
    return () => clearInterval(t);
  }, [refresh]);

  async function toggleService() {
    setBusy(true);
    try {
      await apiFetch("/api/service", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !active }),
      });
      pushBubble({ title: !active ? "Layanan diaktifkan" : "Layanan dijeda", tone: "ok" });
      refresh();
    } finally {
      setBusy(false);
    }
  }

  async function addForward() {
    if (!url.trim()) return;
    setBusy(true);
    try {
      await apiFetch("/api/forwards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      setUrl("");
      pushBubble({ title: "Forward ditambahkan", tone: "ok" });
      refresh();
    } finally {
      setBusy(false);
    }
  }

  async function removeForward(id: string) {
    await apiFetch(`/api/forwards?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    pushBubble({ title: "Forward dihapus", tone: "info" });
    refresh();
  }

  function toggleSound() {
    const v = !sound;
    setSound(v);
    localStorage.setItem(LS_SOUND, v ? "1" : "0");
    pushBubble({ title: v ? "Suara alert ON" : "Suara alert OFF", tone: "info" });
  }

  async function togglePush() {
    if (isWalzApp()) {
      androidCall("requestPostNotifications");
      setPushOn(true);
      localStorage.setItem(LS_PUSH, "1");
      pushBubble({
        title: "Notifikasi aplikasi",
        sub: "Meminta izin menampilkan notifikasi WALZPAY",
        tone: "ok",
      });
      return;
    }
    if (!pushOn) {
      if (typeof Notification === "undefined") {
        pushBubble({ title: "Perangkat tidak mendukung notifikasi", tone: "err" });
        return;
      }
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        pushBubble({ title: "Izin notifikasi ditolak", tone: "err" });
        return;
      }
      setPushOn(true);
      localStorage.setItem(LS_PUSH, "1");
      pushBubble({ title: "Notifikasi aktif", sub: "Akan muncul saat uang masuk", tone: "ok" });
    } else {
      setPushOn(false);
      localStorage.setItem(LS_PUSH, "0");
      pushBubble({ title: "Notifikasi dimatikan", tone: "info" });
    }
  }

  async function copyHook() {
    try {
      await navigator.clipboard.writeText(hookPath);
      pushBubble({ title: "URL webhook disalin", tone: "info" });
    } catch {
      prompt("Salin URL:", hookPath);
    }
  }

  const maxWeek = Math.max(1, ...week.map((d) => d.amount));
  const todayAmt = stats?.todayAmount ?? 0;
  const todayCnt = stats?.todayCount ?? 0;
  const totalAmt = stats?.totalAmount ?? 0;
  const totalCnt = stats?.count ?? 0;

  return (
    <div className="home-v2">
      {err ? (
        <section className="glass card-v2 anim-shake" role="alert">
          <p style={{ color: "var(--rose)", margin: 0, textAlign: "center" }}>⚠️ {err}</p>
        </section>
      ) : null}

      <section className="glass card-v2 home-hero anim-rise">
        <div className="hero-glow" aria-hidden />
        <p className="hero-kicker">💰 Masuk hari ini</p>
        <p className="hero-rp">{formatRp(todayAmt)}</p>
        <p className="hero-sub">
          {todayCnt} transaksi · total {formatRp(totalAmt)}
        </p>
        <div className="hero-stats-grid">
          <div className="hero-stat">
            <span className="hero-stat-label">Hari ini</span>
            <span className="hero-stat-value">{todayCnt}</span>
            <span className="hero-stat-hint">{formatRp(todayAmt)}</span>
          </div>
          <div className="hero-stat">
            <span className="hero-stat-label">Pending</span>
            <span className="hero-stat-value">{pendingLive}</span>
            <span className="hero-stat-hint">menunggu</span>
          </div>
          <div className="hero-stat">
            <span className="hero-stat-label">Sukses</span>
            <span className="hero-stat-value">{successLive}</span>
            <span className="hero-stat-hint">lunas</span>
          </div>
          <div className="hero-stat">
            <span className="hero-stat-label">Semua</span>
            <span className="hero-stat-value">{totalCnt}</span>
            <span className="hero-stat-hint">{formatRp(totalAmt)}</span>
          </div>
        </div>
      </section>

      <section className="glass card-v2 anim-rise" style={{ animationDelay: "0.04s" }}>
        <h2>📊 7 hari terakhir</h2>
        <div className="week-bars">
          {week.length === 0 ? (
            <p className="empty" style={{ width: "100%" }}>Belum ada data minggu ini</p>
          ) : (
            week.map((d) => (
              <div key={d.key} className="bar-col">
                <div
                  className="bar"
                  style={{ height: `${Math.max(6, (d.amount / maxWeek) * 100)}%` }}
                  title={formatRp(d.amount)}
                />
                <span className="bar-label">{d.label}</span>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="glass card-v2 row anim-rise" style={{ animationDelay: "0.06s" }}>
        <div>
          <h2 style={{ marginBottom: 4 }}>⚡ Layanan aktif</h2>
          <p className="muted">{active ? "Menerima webhook" : "Dijeda"}</p>
        </div>
        <label className={`switch${active ? " is-on" : " is-off"}`}>
          <input type="checkbox" checked={active} disabled={busy} onChange={toggleService} />
          <span className="slider" />
        </label>
      </section>

      <section className="glass card-v2 anim-rise" style={{ animationDelay: "0.08s" }}>
        <h2>🧾 Pembayaran terakhir</h2>
        {stats?.latest ? (
          <div className="home-latest">
            <p className="amount">{formatRp(stats.latest.amount)}</p>
            <p className="muted" style={{ marginTop: 4 }}>
              {stats.latest.merchantId}
              {stats.latest.paymentSource ? ` · ${stats.latest.paymentSource}` : ""}
            </p>
            <p className="muted">{formatTime(stats.latest.receivedAt)}</p>
          </div>
        ) : (
          <p className="empty">Belum ada data</p>
        )}
      </section>

      <section className="glass card-v2 anim-rise" style={{ animationDelay: "0.1s" }}>
        <h2>🔗 Webhook HP</h2>
        <code className="code">{hookPath}</code>
        <button type="button" className="btn btn-block btn-press" onClick={copyHook}>
          📋 Salin URL
        </button>
      </section>

      <section className="glass card-v2 anim-rise" style={{ animationDelay: "0.12s" }}>
        <h2>↪️ Forward URL</h2>
        <div className="form-row" style={{ marginTop: 8 }}>
          <input
            className="input"
            placeholder="https://…"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
          <button
            type="button"
            className="btn btn-press"
            style={{ marginTop: 0 }}
            disabled={busy}
            onClick={addForward}
          >
            + Tambah
          </button>
        </div>
        {forwards.map((f) => (
          <div key={f.id} className="list-item" style={{ marginTop: 10 }}>
            <code className="code" style={{ flex: 1, marginTop: 0 }}>
              {f.url}
            </code>
            <button
              type="button"
              className="btn btn-ghost btn-press"
              style={{ marginTop: 0 }}
              onClick={() => removeForward(f.id)}
            >
              Hapus
            </button>
          </div>
        ))}
      </section>

      <section className="glass card-v2 row anim-rise" style={{ animationDelay: "0.14s" }}>
        <div>
          <h2 style={{ marginBottom: 4 }}>🔊 Suara alert</h2>
          <p className="muted">Beep saat uang masuk</p>
        </div>
        <label className={`switch${sound ? " is-on" : " is-off"}`}>
          <input type="checkbox" checked={sound} onChange={toggleSound} />
          <span className="slider" />
        </label>
      </section>

      <section className="glass card-v2 row anim-rise" style={{ animationDelay: "0.16s" }}>
        <div>
          <h2 style={{ marginBottom: 4 }}>🔔 Notifikasi</h2>
          <p className="muted">{pushOn ? "Aktif" : "Izin notifikasi WALZPAY"}</p>
        </div>
        <label className={`switch${pushOn ? " is-on" : " is-off"}`}>
          <input type="checkbox" checked={pushOn} onChange={togglePush} />
          <span className="slider" />
        </label>
      </section>
    </div>
  );
}

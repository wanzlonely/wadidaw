"use client";

import { useCallback, useEffect, useState } from "react";
import {
  androidCall,
  getAndroidStatus,
  isWalzApp,
  type AndroidStatus,
} from "@/lib/walz-android";
import { apiFetch } from "@/lib/client-api";
import { pushBubble } from "@/components/BubbleToasts";

type Row = {
  key: string;
  title: string;
  desc: string;
  okLabel: string;
  badLabel: string;
  action: Parameters<typeof androidCall>[0];
  statusKey?: keyof AndroidStatus;
  statusFn?: (st: AndroidStatus | null) => boolean;
};

const ROWS: Row[] = [
  {
    key: "notification",
    title: "Baca notifikasi e-wallet",
    desc: "Agar WALZPAY bisa mendeteksi transfer masuk dari DANA, GoPay, OVO, dan lainnya.",
    okLabel: "Sudah aktif",
    badLabel: "Belum diizinkan",
    action: "openNotificationAccess",
    statusKey: "notification",
  },
  {
    key: "push",
    title: "Notifikasi aplikasi",
    desc: "Izin menampilkan pemberitahuan dari WALZPAY di HP Anda (bukan membaca notifikasi app lain).",
    okLabel: "Sudah diizinkan",
    badLabel: "Belum diizinkan",
    action: "requestPostNotifications",
    statusFn: (st) => Boolean(st && (st as AndroidStatus & { push?: boolean }).push),
  },
  {
    key: "battery",
    title: "Tanpa batasan baterai",
    desc: "Mencegah sistem mematikan monitoring saat HP hemat daya.",
    okLabel: "Tanpa optimasi",
    badLabel: "Masih dibatasi",
    action: "openBattery",
    statusKey: "battery",
  },
  {
    key: "autostart",
    title: "Mulai otomatis",
    desc: "Menyalakan ulang listener setelah HP di-restart (Xiaomi, OPPO, Vivo, dll).",
    okLabel: "Sudah diatur",
    badLabel: "Perlu diatur di HP",
    action: "openAutostart",
  },
  {
    key: "overlay",
    title: "Tampil di atas app lain",
    desc: "Opsional · memungkinkan indikator singkat saat ada pembayaran.",
    okLabel: "Diizinkan",
    badLabel: "Belum diizinkan",
    action: "openOverlay",
    statusKey: "overlay",
  },
  {
    key: "packages",
    title: "Sumber notifikasi",
    desc: "Pilih aplikasi e-wallet yang ingin dipantau. Hanya app yang terpasang di HP.",
    okLabel: "App dipilih",
    badLabel: "Belum memilih",
    action: "openPackagePicker",
    statusFn: (st) => (st?.packages ?? 0) > 0,
  },
];

export function AndroidPermissions() {
  const [inApp, setInApp] = useState(false);
  const [st, setSt] = useState<AndroidStatus | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [hook, setHook] = useState("");

  const refresh = useCallback(() => {
    const app = isWalzApp();
    setInApp(app);
    if (app) setSt(getAndroidStatus());
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 2000);
    return () => clearInterval(t);
  }, [refresh]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setHook(`${window.location.origin}/api/webhook`);
    }
    apiFetch("/api/settings")
      .then(async (r) => {
        if (!r.ok) return;
        const d = await r.json();
        const key = d.settings?.apiKey || "";
        const secret = d.settings?.webhookSecret || "";
        setApiKey(key);
        if (isWalzApp() && window.WalzAndroid) {
          try {
            if (key) window.WalzAndroid.setApiKey(key);
            window.WalzAndroid.setWebhookUrl(
              `${window.location.origin}/api/webhook`
            );
            window.WalzAndroid.setWebhookSecret(secret || "");
          } catch {
            /* ignore */
          }
        }
      })
      .catch(() => {});
  }, []);

  function run(action: Parameters<typeof androidCall>[0], title: string) {
    if (!inApp) {
      pushBubble({
        title: "Buka lewat aplikasi WALZPAY",
        sub: "Izin sistem hanya tersedia di APK",
        tone: "err",
      });
      return;
    }
    const ok = androidCall(action);
    if (ok) {
      pushBubble({ title, tone: "ok" });
      setTimeout(refresh, 1000);
    }
  }

  function isOk(row: Row): boolean | null {
    if (!st && row.statusKey) return null;
    if (row.statusFn) return row.statusFn(st);
    if (row.statusKey && st) return Boolean(st[row.statusKey]);
    return null;
  }

  const doneCount = ROWS.filter((r) => isOk(r) === true).length;
  const listenerOn = Boolean(st?.listener);

  return (
    <div className="izin-page">
      <section className="glass card-v2 anim-rise izin-hero">
        <p className="izin-kicker">Monitoring pembayaran</p>
        <h2 className="izin-title">Izin Android</h2>
        <p className="muted izin-lead">
          Aktifkan izin di bawah agar transfer QRIS terdeteksi otomatis, bahkan
          saat Anda membuka aplikasi lain.
        </p>
        <div className="izin-progress">
          <div
            className="izin-progress-bar"
            style={{ width: `${(doneCount / ROWS.length) * 100}%` }}
          />
        </div>
        <p className="izin-progress-label">
          {doneCount} dari {ROWS.length} siap
          {listenerOn ? " · Listener aktif" : ""}
        </p>
      </section>

      {!inApp ? (
        <section className="glass card-v2 anim-rise">
          <p className="muted" style={{ margin: 0 }}>
            Halaman ini paling berguna di aplikasi WALZPAY di HP. Di browser,
            izin sistem tidak bisa diaktifkan.
          </p>
        </section>
      ) : null}

      {ROWS.map((row) => {
        const ok = isOk(row);
        const statusText =
          ok === true ? row.okLabel : ok === false ? row.badLabel : "Memeriksa…";
        return (
          <section key={row.key} className="glass card-v2 anim-rise izin-row">
            <div className="izin-row-top">
              <div className="izin-row-text">
                <h3>{row.title}</h3>
                <p className="muted">{row.desc}</p>
              </div>
              <span className={`izin-badge${ok === true ? " ok" : ok === false ? " bad" : ""}`}>
                {statusText}
              </span>
            </div>
            <button
              type="button"
              className="btn btn-primary btn-block btn-press"
              style={{ marginTop: 12 }}
              onClick={() => run(row.action, row.title)}
            >
              {ok === true ? "Buka lagi" : "Aktifkan"}
            </button>
          </section>
        );
      })}

      <section className="glass card-v2 anim-rise izin-row">
        <div className="izin-row-top">
          <div className="izin-row-text">
            <h3>Listener monitoring</h3>
            <p className="muted">
              Menyalakan layanan latar belakang yang mengirim notifikasi
              pembayaran ke server WALZPAY.
            </p>
          </div>
          <span className={`izin-badge${listenerOn ? " ok" : " bad"}`}>
            {listenerOn ? "Aktif" : "Nonaktif"}
          </span>
        </div>
        <button
          type="button"
          className="btn btn-primary btn-block btn-press"
          style={{ marginTop: 12 }}
          onClick={() => {
            if (!apiKey && !listenerOn) {
              pushBubble({
                title: "API key belum ada",
                sub: "Buka Setel lalu salin API key, atau generate di sana",
                tone: "err",
              });
              return;
            }
            run("toggleListener", listenerOn ? "Listener dimatikan" : "Listener diaktifkan");
          }}
        >
          {listenerOn ? "Matikan listener" : "Aktifkan listener"}
        </button>
        <button
          type="button"
          className="btn btn-block btn-ghost btn-press"
          style={{ marginTop: 8 }}
          onClick={() => run("saveListener", "Pengaturan disimpan")}
        >
          Simpan pengaturan
        </button>
        {hook ? (
          <p className="muted" style={{ marginTop: 12, fontSize: 11, wordBreak: "break-all" }}>
            Webhook: {hook}
          </p>
        ) : null}
      </section>

      <section className="glass card-v2 anim-rise">
        <h3 style={{ marginTop: 0 }}>Shizuku (opsional)</h3>
        <p className="muted">
          Untuk perangkat yang sangat agresif mematikan app di background.
          Tidak wajib untuk sebagian besar pengguna.
        </p>
        <p className="muted" style={{ fontSize: 12 }}>
          Status: {st?.shizuku || "—"}
        </p>
        <button
          type="button"
          className="btn btn-block btn-ghost btn-press"
          style={{ marginTop: 8 }}
          onClick={() => run("openShizuku", "Shizuku")}
        >
          Atur Shizuku
        </button>
      </section>
    </div>
  );
}

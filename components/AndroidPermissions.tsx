"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  androidCall,
  getAndroidStatus,
  getPackagesList,
  isWalzApp,
  setSelectedPackages,
  type AndroidStatus,
  type PackageItem,
} from "@/lib/walz-android";
import { apiFetch } from "@/lib/client-api";
import { pushBubble } from "@/components/BubbleToasts";

function IzinIcon({ name }: { name: string }) {
  const common = {
    width: 18,
    height: 18,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  switch (name) {
    case "notification":
      return (
        <svg {...common} aria-hidden>
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
      );
    case "push":
      return (
        <svg {...common} aria-hidden>
          <path d="M22 17H2a3 3 0 0 0 3-3V9a7 7 0 0 1 14 0v5a3 3 0 0 0 3 3z" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
      );
    case "battery":
      return (
        <svg {...common} aria-hidden>
          <rect x="2" y="7" width="18" height="10" rx="2" />
          <path d="M22 11v2M6 11v2M10 11v2M14 11v2" />
        </svg>
      );
    case "autostart":
      return (
        <svg {...common} aria-hidden>
          <path d="M5 12h14" />
          <path d="M12 5l7 7-7 7" />
        </svg>
      );
    case "overlay":
      return (
        <svg {...common} aria-hidden>
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <path d="M3 9h18M9 21V9" />
        </svg>
      );
    case "packages":
      return (
        <svg {...common} aria-hidden>
          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
          <path d="M3.27 6.96L12 12.01l8.73-5.05M12 22.08V12" />
        </svg>
      );
    case "listener":
      return (
        <svg {...common} aria-hidden>
          <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
        </svg>
      );
    case "shizuku":
      return (
        <svg {...common} aria-hidden>
          <circle cx="12" cy="12" r="3" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
        </svg>
      );
    default:
      return null;
  }
}

type Row = {
  key: string;
  title: string;
  desc: string;
  okLabel: string;
  badLabel: string;
  action: Parameters<typeof androidCall>[0];
  statusKey?: keyof AndroidStatus;
  statusFn?: (st: AndroidStatus | null) => boolean;
  optional?: boolean;
  isPackages?: boolean;
};

const ROWS: Row[] = [
  {
    key: "notification",
    title: "Baca notifikasi e-wallet",
    desc: "Deteksi transfer masuk dari DANA, GoPay, OVO, ShopeePay, dan lainnya secara otomatis.",
    okLabel: "Sudah diizinkan",
    badLabel: "Belum diizinkan",
    action: "openNotificationAccess",
    statusKey: "notification",
  },
  {
    key: "push",
    title: "Notifikasi aplikasi",
    desc: "Tampilkan pemberitahuan dari WALZPAY di HP Anda.",
    okLabel: "Sudah diizinkan",
    badLabel: "Belum diizinkan",
    action: "requestPostNotifications",
    statusFn: (st) => Boolean(st?.push),
  },
  {
    key: "battery",
    title: "Tanpa batasan baterai",
    desc: "Cegah sistem mematikan monitoring saat mode hemat daya aktif.",
    okLabel: "Tanpa optimasi",
    badLabel: "Masih dibatasi",
    action: "openBattery",
    statusKey: "battery",
  },
  {
    key: "autostart",
    title: "Mulai otomatis",
    desc: "Jalankan ulang listener setelah HP di-restart (Xiaomi, OPPO, Vivo, Realme, dll).",
    okLabel: "Sudah diatur",
    badLabel: "Perlu diatur",
    action: "openAutostart",
  },
  {
    key: "overlay",
    title: "Tampil di atas app lain",
    desc: "Opsional. Indikator singkat saat pembayaran berhasil diterima.",
    okLabel: "Sudah diizinkan",
    badLabel: "Belum diizinkan",
    action: "openOverlay",
    statusKey: "overlay",
    optional: true,
  },
  {
    key: "packages",
    title: "Sumber notifikasi",
    desc: "Pilih aplikasi e-wallet yang dipantau. Tidak ada yang dipilih otomatis.",
    okLabel: "Sudah dipilih",
    badLabel: "Belum memilih",
    action: "openPackagePicker",
    statusFn: (st) => (st?.packages ?? 0) > 0,
    isPackages: true,
  },
];

export function AndroidPermissions() {
  const [inApp, setInApp] = useState(false);
  const [st, setSt] = useState<AndroidStatus | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pkgList, setPkgList] = useState<PackageItem[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [autostartTick, setAutostartTick] = useState(0);

  const refresh = useCallback(() => {
    const app = isWalzApp();
    setInApp(app);
    if (app) setSt(getAndroidStatus());
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 1200);
    const onVis = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", refresh);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", refresh);
    };
  }, [refresh]);

  useEffect(() => {
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

  function isAutostartDone(): boolean {
    try {
      return localStorage.getItem("walzpay_autostart_done") === "1";
    } catch {
      return false;
    }
  }

  function markAutostartDone() {
    try {
      localStorage.setItem("walzpay_autostart_done", "1");
    } catch {
      /* ignore */
    }
    setAutostartTick((n) => n + 1);
  }

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
      if (action === "openAutostart") markAutostartDone();
      pushBubble({
        title,
        sub:
          action === "openAutostart"
            ? "Aktifkan WALZPAY di pengaturan OEM"
            : undefined,
        tone: "ok",
      });
      setTimeout(refresh, 400);
      setTimeout(refresh, 1500);
    }
  }

  function openPackages() {
    if (!inApp) {
      pushBubble({
        title: "Buka lewat aplikasi WALZPAY",
        sub: "Pilih sumber hanya tersedia di APK",
        tone: "err",
      });
      return;
    }
    const list = getPackagesList();
    if (list.length === 0) {
      run("openPackagePicker", "Pilih sumber");
      return;
    }
    setPkgList(list);
    setSelected(new Set(list.filter((p) => p.selected).map((p) => p.pkg)));
    setSearch("");
    setPickerOpen(true);
  }

  function togglePkg(pkg: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(pkg)) next.delete(pkg);
      else next.add(pkg);
      return next;
    });
  }

  function savePackages() {
    setSaving(true);
    const arr = Array.from(selected);
    const ok = setSelectedPackages(arr);
    if (ok) {
      pushBubble({ title: `Sumber disimpan (${arr.length})`, tone: "ok" });
      setPickerOpen(false);
      setTimeout(refresh, 400);
      setTimeout(refresh, 1200);
    } else {
      pushBubble({ title: "Gagal menyimpan", tone: "err" });
    }
    setSaving(false);
  }

  function isOk(row: Row): boolean | null {
    if (!inApp) return null;
    if (row.key === "autostart") {
      void autostartTick;
      return isAutostartDone();
    }
    if (row.statusFn) return row.statusFn(st);
    if (row.statusKey && st) return Boolean(st[row.statusKey]);
    return null;
  }

  const filteredPkgs = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return pkgList;
    return pkgList.filter(
      (p) =>
        p.label.toLowerCase().includes(q) || p.pkg.toLowerCase().includes(q)
    );
  }, [pkgList, search]);

  const requiredRows = ROWS.filter((r) => !r.optional);
  const doneCount = requiredRows.filter((r) => isOk(r) === true).length;
  const totalRequired = requiredRows.length;
  const listenerOn = Boolean(st?.listener);
  const progressPct =
    totalRequired === 0 ? 0 : Math.round((doneCount / totalRequired) * 100);

  return (
    <div className="izin-page">
      <section className="glass card-v2 anim-rise izin-hero">
        <div className="izin-hero-top">
          <div>
            <p className="izin-kicker">Monitoring pembayaran</p>
            <h2 className="izin-title">Izin Android</h2>
          </div>
          <div
            className={`izin-live-dot${listenerOn ? " on" : ""}`}
            title={listenerOn ? "Listener aktif" : "Listener nonaktif"}
          />
        </div>
        <p className="muted izin-lead">
          Aktifkan izin di bawah agar transfer QRIS terdeteksi otomatis.
        </p>
        <div className="izin-progress">
          <div
            className="izin-progress-bar"
            style={{ width: `${progressPct}%` }}
          />
        </div>
        <p className="izin-progress-label">
          {inApp
            ? `${doneCount}/${totalRequired} izin wajib siap${listenerOn ? " · Listener ON" : ""}`
            : "Buka di aplikasi WALZPAY untuk mengatur izin"}
        </p>
      </section>

      {!inApp ? (
        <section className="glass card-v2 anim-rise izin-browser-note">
          <p className="muted" style={{ margin: 0 }}>
            Halaman ini mengatur izin native Android. Buka lewat aplikasi WALZPAY di HP.
          </p>
        </section>
      ) : null}

      {ROWS.map((row, idx) => {
        const ok = isOk(row);
        const statusText =
          !inApp
            ? "—"
            : ok === true
              ? row.okLabel
              : ok === false
                ? row.badLabel
                : "Memeriksa…";

        let btnLabel: string;
        if (row.isPackages) {
          btnLabel = ok === true ? "Kelola sumber" : "Pilih aplikasi";
        } else if (ok === true) {
          btnLabel = "Buka pengaturan";
        } else {
          btnLabel = "Izinkan";
        }

        const isGranted = ok === true;

        return (
          <section
            key={row.key}
            className="glass card-v2 anim-rise izin-row"
            style={{ animationDelay: `${0.04 + idx * 0.03}s` }}
          >
            <div className="izin-row-top">
              <div className="izin-ico">
                <IzinIcon name={row.key} />
              </div>
              <div className="izin-row-text" style={{ flex: 1 }}>
                <h3>
                  {row.title}
                  {row.optional ? (
                    <span className="izin-optional">opsional</span>
                  ) : null}
                </h3>
                <p className="muted">{row.desc}</p>
              </div>
              <span
                className={`izin-badge${isGranted ? " ok" : ok === false ? " bad" : ""}`}
              >
                {statusText}
              </span>
            </div>
            <button
              type="button"
              className={`btn btn-block btn-press${isGranted ? " btn-ghost" : ""}`}
              style={{ marginTop: 12 }}
              onClick={() =>
                row.isPackages ? openPackages() : run(row.action, row.title)
              }
            >
              {btnLabel}
            </button>
          </section>
        );
      })}

      <section className="glass card-v2 anim-rise izin-row izin-listener">
        <div className="izin-row-top">
          <div className="izin-ico">
            <IzinIcon name="listener" />
          </div>
          <div className="izin-row-text" style={{ flex: 1 }}>
            <h3>Listener monitoring</h3>
            <p className="muted">
              Layanan latar belakang yang mengirim notifikasi pembayaran ke server.
            </p>
          </div>
          <span className={`izin-badge${listenerOn ? " ok" : " bad"}`}>
            {inApp ? (listenerOn ? "Aktif" : "Nonaktif") : "—"}
          </span>
        </div>
        <button
          type="button"
          className={`btn btn-block btn-press${listenerOn ? " btn-ghost" : ""}`}
          style={{ marginTop: 12 }}
          onClick={() => {
            if (!apiKey && !listenerOn) {
              pushBubble({
                title: "API key belum ada",
                sub: "Buka Profil / Pengaturan lalu generate API key",
                tone: "err",
              });
              return;
            }
            run(
              "toggleListener",
              listenerOn ? "Listener dimatikan" : "Listener diaktifkan"
            );
          }}
        >
          {listenerOn ? "Matikan listener" : "Aktifkan listener"}
        </button>
      </section>

      <section className="glass card-v2 anim-rise izin-row">
        <div className="izin-row-top">
          <div className="izin-ico">
            <IzinIcon name="shizuku" />
          </div>
          <div className="izin-row-text" style={{ flex: 1 }}>
            <h3>
              Shizuku <span className="izin-optional">opsional</span>
            </h3>
            <p className="muted">
              Untuk HP yang agresif mematikan app di background.
            </p>
          </div>
          <span className="izin-badge">{inApp ? st?.shizuku || "—" : "—"}</span>
        </div>
        <button
          type="button"
          className="btn btn-block btn-ghost btn-press"
          style={{ marginTop: 12 }}
          onClick={() => run("openShizuku", "Shizuku")}
        >
          Atur Shizuku
        </button>
      </section>

      {pickerOpen ? (
        <div className="izin-picker-overlay" role="dialog" aria-modal="true">
          <div className="izin-picker-sheet glass card-v2">
            <div className="izin-picker-header">
              <h3>Pilih sumber notifikasi</h3>
              <button
                type="button"
                className="izin-picker-close"
                onClick={() => setPickerOpen(false)}
                aria-label="Tutup"
              >
                ✕
              </button>
            </div>
            <p className="muted" style={{ margin: "0 0 10px", fontSize: 12 }}>
              Centang aplikasi yang ingin dipantau. Tidak ada yang dipilih otomatis.
            </p>
            <div className="izin-search-wrap">
              <input
                type="search"
                className="input izin-search"
                placeholder="Cari aplikasi…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                autoFocus
              />
            </div>
            <div className="izin-pkg-list">
              {filteredPkgs.length === 0 ? (
                <p className="empty" style={{ padding: 20 }}>
                  Tidak ada aplikasi yang cocok
                </p>
              ) : (
                filteredPkgs.map((p) => {
                  const checked = selected.has(p.pkg);
                  return (
                    <label
                      key={p.pkg}
                      className={`izin-pkg-item${checked ? " checked" : ""}`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => togglePkg(p.pkg)}
                      />
                      <div className="izin-pkg-text">
                        <span className="izin-pkg-label">{p.label}</span>
                        <span className="izin-pkg-id">{p.pkg}</span>
                      </div>
                    </label>
                  );
                })
              )}
            </div>
            <div className="izin-picker-actions">
              <button
                type="button"
                className="btn btn-ghost btn-press"
                onClick={() => setPickerOpen(false)}
              >
                Batal
              </button>
              <button
                type="button"
                className="btn btn-press"
                disabled={saving}
                onClick={savePackages}
              >
                {saving ? "Menyimpan…" : `Simpan (${selected.size})`}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

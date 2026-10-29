"use client";

import { useCallback, useEffect, useState } from "react";
import {
  androidCall,
  getAndroidStatus,
  isWalzApp,
  type AndroidStatus,
} from "@/lib/walz-android";
import { pushBubble } from "@/components/BubbleToasts";

/**
 * Panel permission native — hanya aktif di APK WebView.
 * Di browser biasa menampilkan petunjuk install app.
 */
export function AndroidPermissions({ apiKey, webhookUrl, webhookSecret }: {
  apiKey?: string;
  webhookUrl?: string;
  webhookSecret?: string;
}) {
  const [inApp, setInApp] = useState(false);
  const [st, setSt] = useState<AndroidStatus | null>(null);

  const refresh = useCallback(() => {
    const app = isWalzApp();
    setInApp(app);
    if (app) setSt(getAndroidStatus());
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 2500);
    return () => clearInterval(t);
  }, [refresh]);

  useEffect(() => {
    if (!inApp || !window.WalzAndroid) return;
    try {
      if (apiKey) window.WalzAndroid.setApiKey(apiKey);
      if (webhookUrl) window.WalzAndroid.setWebhookUrl(webhookUrl);
      if (webhookSecret != null) window.WalzAndroid.setWebhookSecret(webhookSecret);
    } catch {
      /* ignore */
    }
  }, [inApp, apiKey, webhookUrl, webhookSecret]);

  function run(action: Parameters<typeof androidCall>[0], okMsg: string) {
    if (!inApp) {
      pushBubble({
        title: "Hanya di aplikasi WALZPAY",
        sub: "Install APK agar izin sistem berfungsi",
        tone: "err",
      });
      return;
    }
    const ok = androidCall(action);
    if (ok) {
      pushBubble({ title: okMsg, tone: "ok" });
      setTimeout(refresh, 800);
    } else {
      pushBubble({ title: "Gagal memanggil native", tone: "err" });
    }
  }

  const row = (
    label: string,
    status: string,
    action: Parameters<typeof androidCall>[0],
    msg: string
  ) => (
    <div
      className="list-item"
      style={{ marginTop: 10, alignItems: "center", gap: 10 }}
    >
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 600, color: "var(--ink)" }}>{label}</div>
        <p className="muted" style={{ margin: 0, fontSize: 12 }}>
          {status}
        </p>
      </div>
      <button
        type="button"
        className="btn btn-primary btn-press"
        style={{ marginTop: 0, minWidth: 88 }}
        data-walz-action={action.replace(/([A-Z])/g, "_$1").toLowerCase().replace(/^_/, "")}
        onClick={() => run(action, msg)}
      >
        Atur
      </button>
    </div>
  );

  return (
    <section className="glass card-v2 anim-rise">
      <h2>Izin Android & Listener</h2>
      {!inApp ? (
        <p className="muted">
          Buka halaman ini dari aplikasi WALZPAY di HP agar tombol di bawah
          langsung membuka pengaturan sistem (notifikasi, baterai, autostart,
          sumber notifikasi).
        </p>
      ) : (
        <p className="muted" style={{ marginBottom: 4 }}>
          Tombol di bawah memanggil izin native di perangkat Anda.
        </p>
      )}

      {row(
        "Akses notifikasi",
        st?.notification ? "AKTIF" : "Belum diizinkan",
        "openNotificationAccess",
        "Buka pengaturan akses notifikasi"
      )}
      {row(
        "Tanpa batasan baterai",
        st?.battery ? "Tanpa optimasi" : "Masih dioptimasi",
        "openBattery",
        "Buka pengaturan baterai"
      )}
      {row(
        "Autostart",
        "OEM (Xiaomi/OPPO/Vivo/…)",
        "openAutostart",
        "Buka pengaturan autostart"
      )}
      {row(
        "Tampil di atas app lain",
        st?.overlay ? "Diizinkan" : "Belum diizinkan",
        "openOverlay",
        "Buka izin overlay"
      )}
      {row(
        "Sumber notifikasi",
        st ? `${st.packages} app dipilih` : "Pilih app e-wallet",
        "openPackagePicker",
        "Pilih sumber notifikasi"
      )}
      {row(
        "Shizuku (opsional)",
        st?.shizuku || "—",
        "openShizuku",
        "Cek Shizuku"
      )}

      <div
        className="list-item"
        style={{ marginTop: 14, alignItems: "center", gap: 10 }}
      >
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, color: "var(--ink)" }}>
            Listener monitoring
          </div>
          <p className="muted" style={{ margin: 0, fontSize: 12 }}>
            {st?.listener ? "Aktif · background" : "Nonaktif"}
          </p>
        </div>
        <button
          type="button"
          className="btn btn-primary btn-press"
          style={{ marginTop: 0 }}
          onClick={() => run("toggleListener", "Status listener diubah")}
        >
          {st?.listener ? "Matikan" : "Aktifkan"}
        </button>
      </div>

      <button
        type="button"
        className="btn btn-block btn-press"
        style={{ marginTop: 12 }}
        onClick={() => run("saveListener", "Pengaturan disimpan")}
      >
        Simpan pengaturan listener
      </button>
    </section>
  );
}

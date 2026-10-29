import Link from "next/link";
import { Shell } from "@/components/Shell";

export default function PengaturanPage() {
  return (
    <Shell active="/pengaturan" subtitle="Setup · fitur · debug">
      <section className="glass">
        <h2>Fitur baru</h2>
        <ul className="ul">
          <li>
            <strong>Pesanan</strong> — buat nominal pending; notifikasi nominal sama → auto success
          </li>
          <li>
            <strong>Toast + notifikasi browser</strong> — alert saat uang masuk (toggle di Beranda)
          </li>
          <li>
            <strong>Grafik 7 hari</strong> — ringkasan nominal per hari di Beranda
          </li>
        </ul>
      </section>

      <section className="glass">
        <h2>Debug log</h2>
        <p className="muted">Payload webhook mentah & error server.</p>
        <Link href="/debug" className="btn btn-block" style={{ display: "block", textAlign: "center" }}>
          Buka Debug
        </Link>
      </section>

      <section className="glass">
        <h2>Website vs listener HP</h2>
        <p>
          Dashboard WALZPAY tidak membaca notifikasi Android. Gunakan{" "}
          <code>android-listener</code>, QRIS Hook, atau Notification Forwarder → POST ke{" "}
          <code>/api/webhook</code>.
        </p>
      </section>

      <section className="glass">
        <h2>Endpoint</h2>
        <ul className="ul">
          <li>
            <code>POST /api/webhook</code>
          </li>
          <li>
            <code>POST /api/orders</code> · <code>GET /api/orders</code>
          </li>
          <li>
            <code>GET /api/stats/week</code>
          </li>
          <li>
            <code>POST /api/test</code> ·{" "}
            <code>{`{ "kind": "whatsapp" | "dana" | "default" }`}</code>
          </li>
        </ul>
      </section>
    </Shell>
  );
}

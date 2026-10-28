import { Shell } from "@/components/Shell";

export default function PengaturanPage() {
  return (
    <Shell active="/pengaturan" subtitle="Setup · API · web-to-app">
      <section className="glass">
        <h2>Alur produksi</h2>
        <p>
          App di HP menangkap notifikasi → POST ke /api/webhook → parse nominal →
          Upstash Redis → dashboard (poll 2 dtk).
        </p>
      </section>

      <section className="glass">
        <h2>Endpoint</h2>
        <ul className="ul">
          <li>
            <code>POST /api/webhook</code> — dari HP
          </li>
          <li>
            <code>GET /api/payments</code> — list + stats
          </li>
          <li>
            <code>GET /api/health</code> — cek Redis
          </li>
          <li>
            <code>POST /api/test</code> — uji ke Redis
          </li>
          <li>
            <code>/api/forwards</code> · <code>/api/service</code> · <code>/api/logs</code>
          </li>
        </ul>
      </section>

      <section className="glass">
        <h2>QRIS Hook</h2>
        <p>
          Isi webhook: <code>https://DOMAIN/api/webhook</code>
          <br />
          Merchant DANA: package <code>id.dana</code>
        </p>
      </section>

      <section className="glass">
        <h2>Web → App</h2>
        <p>
          PWA (manifest sudah ada) atau Capacitor/TWA. Listener notifikasi tetap
          native.
        </p>
      </section>
    </Shell>
  );
}

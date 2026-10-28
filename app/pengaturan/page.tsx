import { Nav } from "@/components/Nav";

export default function PengaturanPage() {
  return (
    <main className="shell">
      <div className="logo">WALZPAY</div>
      <p className="tagline">Pengaturan · arsitektur · web-to-app</p>
      <Nav active="/pengaturan" />

      <section className="glass">
        <h2>Cara kerja (sama konsep QRIS Hook)</h2>
        <p>
          1. App di HP mendengarkan notifikasi merchant (DANA, GoPay, …).
          <br />
          2. App mengirim JSON ke <code>/api/webhook</code> WALZPAY.
          <br />
          3. Dashboard menampilkan riwayat, statistik, debug.
          <br />
          4. Opsional: forward ke webhook lain (kasir, n8n, Discord).
        </p>
      </section>

      <section className="glass">
        <h2>Endpoint API</h2>
        <ul className="ul">
          <li>
            <code>POST /api/webhook</code> — terima event dari HP
          </li>
          <li>
            <code>GET /api/payments</code> — list + stats
          </li>
          <li>
            <code>POST /api/test</code> — simulasi pembayaran
          </li>
          <li>
            <code>GET|POST /api/forwards</code> — multi webhook
          </li>
          <li>
            <code>GET|POST /api/service</code> — pause/aktif
          </li>
          <li>
            <code>GET /api/logs</code> — debug
          </li>
        </ul>
      </section>

      <section className="glass">
        <h2>Fitur lebih dari app asli</h2>
        <ul className="ul">
          <li>Statistik harian + total</li>
          <li>Filter & pencarian riwayat</li>
          <li>Export CSV</li>
          <li>Multi-forward webhook</li>
          <li>Simulasi pembayaran tanpa HP</li>
          <li>Suara alert di browser</li>
          <li>Pause layanan dari dashboard</li>
          <li>Debug log terpusat</li>
          <li>UI liquid glass siap PWA / web-to-app</li>
        </ul>
      </section>

      <section className="glass">
        <h2>Web → App (nanti)</h2>
        <p>
          Setelah deploy Vercel stabil, bungkus dengan:
        </p>
        <ul className="ul">
          <li>
            <strong>PWA</strong> — install ke home screen (manifest sudah ada)
          </li>
          <li>
            <strong>Capacitor / TWA</strong> — shell Android yang membuka URL
            WALZPAY
          </li>
        </ul>
        <p className="muted" style={{ marginTop: 8 }}>
          Ingat: shell web-to-app tetap tidak bisa baca notifikasi sistem.
          Listener native (QRIS Hook) tetap dibutuhkan, atau kamu bangun plugin
          Capacitor khusus notification listener.
        </p>
      </section>

      <section className="glass">
        <h2>Keamanan</h2>
        <p>
          Set env Vercel <code>WEBHOOK_SECRET</code>, lalu header{" "}
          <code>x-walzpay-secret</code> dari app HP.
        </p>
      </section>

      <section className="glass">
        <h2>Penyimpanan</h2>
        <p>
          Saat ini memori server (demo). Untuk produksi: Vercel KV / Postgres agar
          data tidak hilang antar instance.
        </p>
      </section>
    </main>
  );
}

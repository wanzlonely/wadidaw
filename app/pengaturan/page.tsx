import Link from "next/link";

export default function PengaturanPage() {
  return (
    <main className="shell">
      <div className="logo">WALZPAY</div>
      <p className="tagline">Pengaturan & cara pakai</p>

      <nav className="nav">
        <Link href="/">Beranda</Link>
        <Link href="/riwayat">Riwayat</Link>
        <Link href="/pengaturan" className="active">
          Pengaturan
        </Link>
      </nav>

      <section className="glass">
        <h2>Webhook URL</h2>
        <p>
          Setelah deploy ke Vercel, isi di app listener HP (QRIS Hook):
        </p>
        <code className="code">https://YOUR-PROJECT.vercel.app/api/webhook</code>
        <p style={{ marginTop: 10 }}>
          Method: <strong>POST</strong>, Content-Type: application/json
        </p>
      </section>

      <section className="glass">
        <h2>Contoh body</h2>
        <code className="code">
          {`{\n  "merchantId": "dana",\n  "amount": 10000,\n  "paymentSource": "DANA",\n  "rawTitle": "Pembayaran berhasil",\n  "rawText": "Rp10.000"\n}`}
        </code>
      </section>

      <section className="glass">
        <h2>Keamanan (opsional)</h2>
        <p>
          Set env <code>WEBHOOK_SECRET</code> di Vercel, lalu kirim header{" "}
          <code>x-walzpay-secret</code> dengan nilai yang sama dari app HP.
        </p>
      </section>

      <section className="glass">
        <h2>Kenapa masih butuh app di HP?</h2>
        <p>
          Website tidak punya izin membaca notifikasi DANA/GoPay di Android.
          App seperti QRIS Hook yang mendengarkan notifikasi, lalu mengirim data
          ke WALZPAY.
        </p>
      </section>

      <section className="glass">
        <h2>Penyimpanan</h2>
        <p>
          Demo memakai memori server. Di Vercel serverless, data bisa hilang saat
          cold start. Untuk produksi, sambungkan Vercel KV / database.
        </p>
      </section>
    </main>
  );
}

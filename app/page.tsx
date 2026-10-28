import Link from "next/link";
import { listPayments } from "@/lib/store";

export const dynamic = "force-dynamic";

function formatRp(n: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(n);
}

export default function HomePage() {
  const payments = listPayments();
  const total = payments.reduce((s, p) => s + p.amount, 0);
  const latest = payments[0];

  return (
    <main className="shell">
      <div className="logo">WALZPAY</div>
      <p className="tagline">Notifikasi QRIS → Webhook · Dashboard</p>

      <nav className="nav">
        <Link href="/" className="active">
          Beranda
        </Link>
        <Link href="/riwayat">Riwayat</Link>
        <Link href="/pengaturan">Pengaturan</Link>
      </nav>

      <section className="glass">
        <h2>Status layanan</h2>
        <p>
          <span className="badge">Online</span>
        </p>
        <p style={{ marginTop: 10 }}>
          Arahkan webhook app di HP ke endpoint API di bawah. Website ini tidak
          membaca notifikasi Android secara langsung.
        </p>
        <code className="code">/api/webhook</code>
      </section>

      <section className="glass">
        <h2>Ringkasan</h2>
        <p>Total event diterima (sesi instance ini)</p>
        <p className="amount" style={{ marginTop: 6 }}>
          {payments.length} transaksi
        </p>
        <p className="muted" style={{ marginTop: 4 }}>
          Jumlah: {formatRp(total)}
        </p>
      </section>

      <section className="glass">
        <h2>Pembayaran terakhir</h2>
        {latest ? (
          <div className="list-item">
            <div>
              <div className="amount">{formatRp(latest.amount)}</div>
              <p className="muted">
                {latest.merchantId}
                {latest.paymentSource ? ` · ${latest.paymentSource}` : ""}
              </p>
              <p className="muted">
                {new Date(latest.receivedAt).toLocaleString("id-ID")}
              </p>
            </div>
          </div>
        ) : (
          <p className="empty">Belum ada pembayaran. Kirim POST ke /api/webhook.</p>
        )}
      </section>
    </main>
  );
}

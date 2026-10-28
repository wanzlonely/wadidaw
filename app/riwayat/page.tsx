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

export default function RiwayatPage() {
  const payments = listPayments();

  return (
    <main className="shell">
      <div className="logo">WALZPAY</div>
      <p className="tagline">Riwayat pembayaran</p>

      <nav className="nav">
        <Link href="/">Beranda</Link>
        <Link href="/riwayat" className="active">
          Riwayat
        </Link>
        <Link href="/pengaturan">Pengaturan</Link>
      </nav>

      {payments.length === 0 ? (
        <section className="glass">
          <p className="empty">Belum ada data. Tunggu webhook dari HP.</p>
        </section>
      ) : (
        payments.map((p) => (
          <section key={p.id} className="glass">
            <div className="list-item">
              <div>
                <div className="amount">{formatRp(p.amount)}</div>
                <p className="muted">
                  {p.merchantId}
                  {p.paymentSource ? ` · ${p.paymentSource}` : ""}
                </p>
                {p.rawTitle ? <p className="muted">{p.rawTitle}</p> : null}
                <p className="muted">
                  {new Date(p.receivedAt).toLocaleString("id-ID")}
                </p>
              </div>
            </div>
          </section>
        ))
      )}
    </main>
  );
}

import { Nav } from "@/components/Nav";
import { RiwayatClient } from "@/components/RiwayatClient";

export default function RiwayatPage() {
  return (
    <main className="shell">
      <div className="logo">WALZPAY</div>
      <p className="tagline">Riwayat pembayaran · filter · export CSV</p>
      <Nav active="/riwayat" />
      <RiwayatClient />
    </main>
  );
}

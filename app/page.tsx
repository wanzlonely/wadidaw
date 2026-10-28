import { Nav } from "@/components/Nav";
import { Dashboard } from "@/components/Dashboard";

export default function HomePage() {
  return (
    <main className="shell">
      <div className="logo">WALZPAY</div>
      <p className="tagline">Notifikasi QRIS → Webhook · lebih lengkap dari app listener</p>
      <Nav active="/" />
      <Dashboard />
    </main>
  );
}

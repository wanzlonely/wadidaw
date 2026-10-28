import { Nav } from "@/components/Nav";
import { DebugClient } from "@/components/DebugClient";

export default function DebugPage() {
  return (
    <main className="shell">
      <div className="logo">WALZPAY</div>
      <p className="tagline">Debug · log webhook & error</p>
      <Nav active="/debug" />
      <DebugClient />
    </main>
  );
}

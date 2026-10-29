import { Shell } from "@/components/Shell";
import { OrdersClient } from "@/components/OrdersClient";

export default function PesananPage() {
  return (
    <Shell active="/pesanan" subtitle="Generate QRIS">
      <OrdersClient />
    </Shell>
  );
}

import { Shell } from "@/components/Shell";
import { RiwayatClient } from "@/components/RiwayatClient";

export default function RiwayatPage() {
  return (
    <Shell active="/riwayat" subtitle="Riwayat · filter · CSV">
      <RiwayatClient />
    </Shell>
  );
}

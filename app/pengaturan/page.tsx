import { Shell } from "@/components/Shell";
import { ProfileClient } from "@/components/ProfileClient";

export default function PengaturanPage() {
  return (
    <Shell active="/pengaturan" subtitle="QRIS \u00b7 biaya \u00b7 webhook">
      <ProfileClient />
    </Shell>
  );
}

import { Shell } from "@/components/Shell";
import { ProfileClient } from "@/components/ProfileClient";

export default function PengaturanPage() {
  return (
    <Shell active="/pengaturan" subtitle="QRIS · biaya · webhook">
      <ProfileClient />
    </Shell>
  );
}

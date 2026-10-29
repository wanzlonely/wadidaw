import { Shell } from "@/components/Shell";
import { AkunClient } from "@/components/AkunClient";

export default function ProfilPage() {
  return (
    <Shell active="/profil" subtitle="Akun merchant">
      <AkunClient />
    </Shell>
  );
}

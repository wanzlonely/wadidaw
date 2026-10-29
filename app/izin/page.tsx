import { Shell } from "@/components/Shell";
import { AndroidPermissions } from "@/components/AndroidPermissions";

export default function IzinPage() {
  return (
    <Shell active="/izin" subtitle="Izin · monitoring">
      <AndroidPermissions />
    </Shell>
  );
}

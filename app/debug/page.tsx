import { Shell } from "@/components/Shell";
import { DebugClient } from "@/components/DebugClient";

export default function DebugPage() {
  return (
    <Shell active="/debug" subtitle="Log webhook & error">
      <DebugClient />
    </Shell>
  );
}

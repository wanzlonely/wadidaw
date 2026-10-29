"use client";

import { Shell } from "@/components/Shell";
import { ProfileClient } from "@/components/ProfileClient";

export default function ProfilePage() {
  return (
    <Shell active="/pengaturan" subtitle="Profil · API · webhook · fee">
      <ProfileClient />
    </Shell>
  );
}

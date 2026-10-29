"use client";

import { useState } from "react";
import { Shell } from "@/components/Shell";
import { Dashboard } from "@/components/Dashboard";

export default function HomePage() {
  const [redisOk, setRedisOk] = useState<boolean | null>(null);

  return (
    <Shell active="/" redisOk={redisOk} subtitle="Dashboard QRIS">
      <Dashboard onRedis={setRedisOk} />
    </Shell>
  );
}

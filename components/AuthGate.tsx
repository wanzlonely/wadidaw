"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";

export function AuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [ok, setOk] = useState<boolean | null>(null);

  useEffect(() => {
    if (pathname === "/login" || pathname?.startsWith("/pay/")) {
      setOk(true);
      return;
    }
    let cancelled = false;
    fetch("/api/auth", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        if (!d.authenticated) {
          router.replace("/login");
          setOk(false);
        } else {
          setOk(true);
        }
      })
      .catch(() => {
        if (!cancelled) {
          router.replace("/login");
          setOk(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [pathname, router]);

  if (ok === null) {
    return (
      <main className="shell" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p className="muted">Memeriksa sesi…</p>
      </main>
    );
  }
  if (!ok) return null;
  return <>{children}</>;
}

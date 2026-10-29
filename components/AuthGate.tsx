"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";

/** Optional gate — Shell sudah cek sesi. Timeout 8s agar tidak stuck. */
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
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 8000);

    fetch("/api/auth", { credentials: "include", signal: ctrl.signal })
      .then(async (r) => {
        clearTimeout(to);
        if (cancelled) return;
        const d = await r.json().catch(() => ({}));
        if (!r.ok || !d.authenticated) {
          router.replace("/login");
          setOk(false);
        } else {
          setOk(true);
        }
      })
      .catch(() => {
        clearTimeout(to);
        if (!cancelled) {
          router.replace("/login");
          setOk(false);
        }
      });

    return () => {
      cancelled = true;
      clearTimeout(to);
      ctrl.abort();
    };
  }, [pathname, router]);

  if (ok === null) {
    return (
      <main
        className="shell"
        style={{ display: "flex", alignItems: "center", justifyContent: "center" }}
      >
        <p className="muted">Memeriksa sesi…</p>
      </main>
    );
  }
  if (!ok) return null;
  return <>{children}</>;
}

"use client";

import Link from "next/link";

const items = [
  { href: "/", label: "Beranda", icon: "⌂" },
  { href: "/riwayat", label: "Riwayat", icon: "☰" },
  { href: "/pesanan", label: "Pesanan", icon: "◇" },
  { href: "/profil", label: "Profil", icon: "◎" },
];

export function Nav({ active }: { active: string }) {
  return (
    <nav className="nav-bottom" aria-label="Navigasi utama">
      {items.map((it) => (
        <Link
          key={it.href}
          href={it.href}
          className={active === it.href ? "active" : undefined}
          aria-current={active === it.href ? "page" : undefined}
        >
          <span className="ico" aria-hidden>
            {it.icon}
          </span>
          {it.label}
        </Link>
      ))}
    </nav>
  );
}

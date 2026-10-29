"use client";

import Link from "next/link";

function IconHome({ active }: { active?: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V20h14V9.5" />
      <path d="M9 20v-6h6v6" />
    </svg>
  );
}

function IconHistory() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 12a9 9 0 1 0 3-6.7" />
      <path d="M3 4v5h5" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

function IconOrders() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="4" y="4" width="16" height="16" rx="3" />
      <path d="M8 9h8M8 13h5" />
    </svg>
  );
}

function IconIzin() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 3 4 7v5c0 5 3.5 8.5 8 9.5 4.5-1 8-4.5 8-9.5V7l-8-4Z" />
      <path d="M9.5 12.5 11 14l3.5-3.5" />
    </svg>
  );
}

function IconProfile() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 19.5c1.5-3.5 4-5 7-5s5.5 1.5 7 5" />
    </svg>
  );
}

const items = [
  { href: "/", label: "Beranda", Icon: IconHome },
  { href: "/riwayat", label: "Riwayat", Icon: IconHistory },
  { href: "/pesanan", label: "Pesanan", Icon: IconOrders },
  { href: "/izin", label: "Izin", Icon: IconIzin },
  { href: "/profil", label: "Profil", Icon: IconProfile },
];

export function Nav({ active }: { active: string }) {
  return (
    <nav className="nav-bottom" aria-label="Navigasi utama">
      {items.map((it) => {
        const isActive = active === it.href;
        const Icon = it.Icon;
        return (
          <Link
            key={it.href}
            href={it.href}
            className={isActive ? "active" : undefined}
            aria-current={isActive ? "page" : undefined}
          >
            <span className="ico" aria-hidden>
              <Icon />
            </span>
            {it.label}
          </Link>
        );
      })}
    </nav>
  );
}

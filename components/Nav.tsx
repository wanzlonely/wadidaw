"use client";

import Link from "next/link";

function IconHome() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round" width="22" height="22" aria-hidden>
      <path d="M3.5 11.2L12 4.2l8.5 7" />
      <path d="M6.2 10.2V19a1.2 1.2 0 0 0 1.2 1.2h3.3v-5.2h2.6V20.2h3.3A1.2 1.2 0 0 0 17.8 19v-8.8" />
    </svg>
  );
}

function IconHistory() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round" width="22" height="22" aria-hidden>
      <path d="M4.2 12a7.8 7.8 0 1 0 1.8-5" />
      <path d="M4.2 5.5v4.2H8.4" />
      <path d="M12 8.2V12l2.6 1.6" />
    </svg>
  );
}

function IconOrders() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round" width="22" height="22" aria-hidden>
      <path d="M8.2 4.5h7.6l1.4 2.2H6.8L8.2 4.5z" />
      <path d="M6.5 6.7h11v11.6a1.8 1.8 0 0 1-1.8 1.8H8.3a1.8 1.8 0 0 1-1.8-1.8V6.7z" />
      <path d="M10 11.2h4M10 14.8h2.8" />
    </svg>
  );
}

function IconIzin() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round" width="22" height="22" aria-hidden>
      <path d="M12 3.2l6.6 2.6v4.8c0 4.2-2.7 7.6-6.6 9.2-3.9-1.6-6.6-5-6.6-9.2V5.8L12 3.2z" />
      <path d="M9.4 12.1l1.9 1.9 3.6-3.7" />
    </svg>
  );
}

function IconProfile() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round" width="22" height="22" aria-hidden>
      <circle cx="12" cy="9" r="3.4" />
      <path d="M5.6 19.2c1.1-2.9 3.3-4.3 6.4-4.3s5.3 1.4 6.4 4.3" />
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
            <span className="nav-label">{it.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

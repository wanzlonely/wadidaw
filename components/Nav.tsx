"use client";

import Link from "next/link";

/** Simple stroke icons — avoid complex paths that break on WebView */
function IconHome() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="22" height="22" aria-hidden>
      <path d="M4 10.5L12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1V10.5z" />
    </svg>
  );
}

function IconHistory() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="22" height="22" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

function IconOrders() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="22" height="22" aria-hidden>
      <rect x="5" y="4" width="14" height="16" rx="2" />
      <path d="M9 9h6M9 13h4" />
    </svg>
  );
}

function IconIzin() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="22" height="22" aria-hidden>
      <path d="M12 3l7 3v5c0 4.5-3 8-7 9.5C8 19 5 15.5 5 11V6l7-3z" />
      <path d="M9.5 12l2 2 3.5-3.5" />
    </svg>
  );
}

function IconProfile() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="22" height="22" aria-hidden>
      <circle cx="12" cy="9" r="3.5" />
      <path d="M6 19c1.2-2.8 3.4-4 6-4s4.8 1.2 6 4" />
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

import Link from "next/link";

const items = [
  { href: "/", label: "Beranda", icon: "⌂" },
  { href: "/riwayat", label: "Riwayat", icon: "☰" },
  { href: "/debug", label: "Debug", icon: "⚙" },
  { href: "/pengaturan", label: "Atur", icon: "◆" },
];

export function Nav({ active }: { active: string }) {
  return (
    <nav className="nav-bottom" aria-label="Navigasi utama">
      {items.map((it) => (
        <Link
          key={it.href}
          href={it.href}
          className={active === it.href ? "active" : undefined}
        >
          <span className="ico">{it.icon}</span>
          {it.label}
        </Link>
      ))}
    </nav>
  );
}

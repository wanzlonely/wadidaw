import Link from "next/link";

const items = [
  { href: "/", label: "Beranda" },
  { href: "/riwayat", label: "Riwayat" },
  { href: "/debug", label: "Debug" },
  { href: "/pengaturan", label: "Pengaturan" },
];

export function Nav({ active }: { active: string }) {
  return (
    <nav className="nav">
      {items.map((it) => (
        <Link
          key={it.href}
          href={it.href}
          className={active === it.href ? "active" : undefined}
        >
          {it.label}
        </Link>
      ))}
    </nav>
  );
}

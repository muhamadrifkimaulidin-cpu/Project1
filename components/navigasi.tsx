"use client";

import { BarChart3, CheckCheck, Home, PenLine } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export const MENU = [
  { href: "/beranda", label: "Beranda", Ikon: Home },
  { href: "/catat", label: "Catat", Ikon: PenLine },
  { href: "/setujui", label: "Setujui", Ikon: CheckCheck, badge: true },
  { href: "/laporan", label: "Laporan", Ikon: BarChart3 },
] as const;

function Badge({ n }: { n: number }) {
  return <span className={`badge${n > 0 ? " on" : ""}`}>{n > 99 ? "99+" : n}</span>;
}

/** Tab di header (desktop ≥960px) */
export function NavTabs({ menunggu }: { menunggu: number }) {
  const path = usePathname();
  return (
    <nav className="nav-tabs">
      {MENU.map((m) => (
        <Link key={m.href} href={m.href} className={`nav-tab${path.startsWith(m.href) ? " active" : ""}`}>
          {m.label}
          {"badge" in m && <Badge n={menunggu} />}
        </Link>
      ))}
    </nav>
  );
}

/** Navigasi bawah (HP) */
export function BottomNav({ menunggu }: { menunggu: number }) {
  const path = usePathname();
  return (
    <nav className="bnav" aria-label="Navigasi utama">
      {MENU.map(({ href, label, Ikon, ...m }) => (
        <Link
          key={href}
          href={href}
          className={`bnav-btn${path.startsWith(href) ? " active" : ""}`}
          aria-current={path.startsWith(href) ? "page" : undefined}
        >
          <Ikon className="ic" />
          {label}
          {"badge" in m && <Badge n={menunggu} />}
        </Link>
      ))}
    </nav>
  );
}

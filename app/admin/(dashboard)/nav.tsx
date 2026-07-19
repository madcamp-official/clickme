"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import styles from "./dashboard.module.css";

const LINKS = [
  { href: "/admin", label: "개요" },
  { href: "/admin/analytics", label: "분석" },
  { href: "/admin/comments", label: "댓글" },
  { href: "/admin/campaign", label: "캠페인" },
  { href: "/admin/topics", label: "주제" },
] as const;

export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav className={styles.nav}>
      {LINKS.map((link) => {
        const isActive = link.href === "/admin" ? pathname === "/admin" : pathname.startsWith(link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            className={`${styles.navLink} ${isActive ? styles.navLinkActive : ""}`}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}

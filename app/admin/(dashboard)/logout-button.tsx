"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import styles from "./dashboard.module.css";

export function LogoutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function handleLogout() {
    setPending(true);
    try {
      await fetch("/api/admin/logout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
    } finally {
      router.push("/admin/login");
      router.refresh();
    }
  }

  return (
    <button type="button" className={styles.buttonGhost} onClick={handleLogout} disabled={pending}>
      로그아웃
    </button>
  );
}

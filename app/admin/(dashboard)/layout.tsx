import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { ADMIN_SESSION_COOKIE_NAME, isValidAdminSessionCookie } from "../../../lib/server/admin-auth";
import styles from "./dashboard.module.css";
import { LogoutButton } from "./logout-button";
import { AdminNav } from "./nav";

export const metadata: Metadata = {
  title: "관리자 대시보드 | 오늘의 밸런스게임",
  robots: { index: false, follow: false },
};

export default async function AdminDashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const isAuthenticated = isValidAdminSessionCookie(cookieStore.get(ADMIN_SESSION_COOKIE_NAME)?.value);
  if (!isAuthenticated) {
    redirect("/admin/login");
  }

  return (
    <div className={styles.shell}>
      <header className={styles.topbar}>
        <span className={styles.brand}>오늘의 밸런스게임 · 관리자</span>
        <AdminNav />
        <LogoutButton />
      </header>
      <main className={styles.main}>{children}</main>
    </div>
  );
}

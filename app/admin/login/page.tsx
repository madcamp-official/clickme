import type { Metadata } from "next";

import { LoginForm } from "./login-form";
import styles from "./login.module.css";

export const metadata: Metadata = {
  title: "관리자 로그인 | 오늘의 밸런스게임",
  robots: { index: false, follow: false },
};

export default function AdminLoginPage() {
  return (
    <main className={styles.page}>
      <LoginForm />
    </main>
  );
}

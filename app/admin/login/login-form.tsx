"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import styles from "./login.module.css";

export function LoginForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setError(body?.error ?? "로그인에 실패했습니다.");
        return;
      }

      router.push("/admin");
      router.refresh();
    } catch {
      setError("서버에 연결할 수 없습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className={styles.card} onSubmit={handleSubmit}>
      <p className={styles.title}>관리자 로그인</p>
      <p className={styles.subtitle}>오늘의 밸런스게임 운영 대시보드</p>

      <div className={styles.field}>
        <label className={styles.label} htmlFor="admin-password">
          비밀번호
        </label>
        <input
          id="admin-password"
          type="password"
          autoComplete="current-password"
          className={styles.input}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />
      </div>

      <button type="submit" className={styles.submit} disabled={submitting || password.length === 0}>
        {submitting ? "확인 중..." : "로그인"}
      </button>

      {error ? <p className={styles.error}>{error}</p> : null}
    </form>
  );
}

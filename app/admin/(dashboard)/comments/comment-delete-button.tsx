"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import styles from "../dashboard.module.css";

export function CommentDeleteButton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function handleDelete() {
    if (!window.confirm("이 댓글을 삭제할까요? 되돌릴 수 없습니다.")) return;

    setPending(true);
    try {
      const response = await fetch(`/api/admin/comments/${id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      if (response.ok) router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <button type="button" className={styles.buttonDanger} onClick={handleDelete} disabled={pending}>
      삭제
    </button>
  );
}

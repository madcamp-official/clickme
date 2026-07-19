"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import type { Choice } from "../../../../lib/server/contracts";
import styles from "../dashboard.module.css";

export function TopicArchiveForm() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [optionALabel, setOptionALabel] = useState("");
  const [optionAChoice, setOptionAChoice] = useState<Choice>("dip");
  const [optionBLabel, setOptionBLabel] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const optionBChoice: Choice = optionAChoice === "dip" ? "pour" : "dip";

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      !window.confirm(
        "현재 라운드를 마감하고 득표 카운터를 0으로 리셋합니다. 계속할까요? (votes 원본 기록은 삭제되지 않습니다)",
      )
    ) {
      return;
    }

    setSubmitting(true);
    setError(null);
    setSuccess(false);

    try {
      const response = await fetch("/api/admin/topics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, optionALabel, optionAChoice, optionBLabel, optionBChoice, reason }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setError(body?.error ?? "주제를 아카이브할 수 없습니다.");
        return;
      }

      setSuccess(true);
      setTitle("");
      setOptionALabel("");
      setOptionBLabel("");
      setReason("");
      router.refresh();
    } catch {
      setError("서버에 연결할 수 없습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  const canSubmit =
    title.trim().length > 0 && optionALabel.trim().length > 0 && optionBLabel.trim().length > 0 && reason.trim().length > 0;

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <div className={styles.formRow}>
        <label className={styles.formLabel} htmlFor="topic-title">
          다음 라운드 제목
        </label>
        <input
          id="topic-title"
          type="text"
          className={styles.input}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          maxLength={200}
          required
        />
      </div>

      <div className={styles.formRow}>
        <label className={styles.formLabel} htmlFor="option-a-choice">
          현재 라운드에서 &quot;dip&quot;에 해당하던 선택지
        </label>
        <select
          id="option-a-choice"
          className={styles.select}
          value={optionAChoice}
          onChange={(event) => setOptionAChoice(event.target.value as Choice)}
        >
          <option value="dip">dip</option>
          <option value="pour">pour</option>
        </select>
      </div>

      <div className={styles.formRow}>
        <label className={styles.formLabel} htmlFor="option-a-label">
          {optionAChoice} 라벨 (아카이브에 표시될 이름)
        </label>
        <input
          id="option-a-label"
          type="text"
          className={styles.input}
          value={optionALabel}
          onChange={(event) => setOptionALabel(event.target.value)}
          maxLength={60}
          required
        />
      </div>

      <div className={styles.formRow}>
        <label className={styles.formLabel} htmlFor="option-b-label">
          {optionBChoice} 라벨 (아카이브에 표시될 이름)
        </label>
        <input
          id="option-b-label"
          type="text"
          className={styles.input}
          value={optionBLabel}
          onChange={(event) => setOptionBLabel(event.target.value)}
          maxLength={60}
          required
        />
      </div>

      <div className={styles.formRow}>
        <label className={styles.formLabel} htmlFor="archive-reason">
          아카이브 사유 (필수, 기록됨)
        </label>
        <textarea
          id="archive-reason"
          className={styles.textarea}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          maxLength={500}
          required
        />
      </div>

      <button type="submit" className={styles.button} disabled={submitting || !canSubmit}>
        {submitting ? "처리 중..." : "현재 라운드 마감하고 새 주제 시작"}
      </button>

      {error ? <p className={styles.formError}>{error}</p> : null}
      {success ? <p className={styles.formSuccess}>아카이브되었습니다. 득표 카운터가 리셋되었습니다.</p> : null}
    </form>
  );
}

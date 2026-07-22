"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import type { TeamChoice } from "../../../../lib/server/contracts";
import { TEAM_CHOICES } from "../../../../lib/server/contracts";
import styles from "../dashboard.module.css";

const DEFAULT_LABELS: Record<TeamChoice, string> = {
  kia: "KIA 타이거즈",
  samsung: "삼성 라이온즈",
  lg: "LG 트윈스",
  doosan: "두산 베어스",
  kt: "KT 위즈",
  ssg: "SSG 랜더스",
  lotte: "롯데 자이언츠",
  hanwha: "한화 이글스",
  nc: "NC 다이노스",
  kiwoom: "키움 히어로즈",
};

export function TeamTopicArchiveForm() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [labels, setLabels] = useState<Record<TeamChoice, string>>(DEFAULT_LABELS);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      !window.confirm(
        "현재 팀 투표 라운드를 마감하고 득표 카운터를 0으로 리셋합니다. 계속할까요? (team_votes 원본 기록은 삭제되지 않습니다)",
      )
    ) {
      return;
    }

    setSubmitting(true);
    setError(null);
    setSuccess(false);

    try {
      const response = await fetch("/api/admin/team-topics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, reason, labels }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setError(body?.error ?? "팀 주제를 아카이브할 수 없습니다.");
        return;
      }

      setSuccess(true);
      setTitle("");
      setReason("");
      router.refresh();
    } catch {
      setError("서버에 연결할 수 없습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  const canSubmit =
    title.trim().length > 0
    && reason.trim().length > 0
    && TEAM_CHOICES.every((choice) => labels[choice].trim().length > 0);

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <div className={styles.formRow}>
        <label className={styles.formLabel} htmlFor="team-topic-title">
          다음 라운드 제목
        </label>
        <input
          id="team-topic-title"
          type="text"
          className={styles.input}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          maxLength={200}
          required
        />
      </div>

      {TEAM_CHOICES.map((choice) => (
        <div className={styles.formRow} key={choice}>
          <label className={styles.formLabel} htmlFor={`team-topic-label-${choice}`}>
            {choice} 라벨 (아카이브에 표시될 이름)
          </label>
          <input
            id={`team-topic-label-${choice}`}
            type="text"
            className={styles.input}
            value={labels[choice]}
            onChange={(event) => setLabels((current) => ({ ...current, [choice]: event.target.value }))}
            maxLength={60}
            required
          />
        </div>
      ))}

      <div className={styles.formRow}>
        <label className={styles.formLabel} htmlFor="team-archive-reason">
          아카이브 사유 (필수, 기록됨)
        </label>
        <textarea
          id="team-archive-reason"
          className={styles.textarea}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          maxLength={500}
          required
        />
      </div>

      <button type="submit" className={styles.button} disabled={submitting || !canSubmit}>
        {submitting ? "처리 중..." : "현재 팀 라운드 마감하고 새 주제 시작"}
      </button>

      {error ? <p className={styles.formError}>{error}</p> : null}
      {success ? <p className={styles.formSuccess}>아카이브되었습니다. 팀 득표 카운터가 리셋되었습니다.</p> : null}
    </form>
  );
}

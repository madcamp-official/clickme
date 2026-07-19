"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import type { CampaignMode } from "../../../../lib/server/database.types";
import styles from "../dashboard.module.css";

function toDatetimeLocalValue(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function CampaignWindowForm({
  initialStartsAt,
  initialEndsAt,
  initialMode,
}: {
  initialStartsAt: string | null;
  initialEndsAt: string | null;
  initialMode: CampaignMode;
}) {
  const router = useRouter();
  const [startsAt, setStartsAt] = useState(() => toDatetimeLocalValue(initialStartsAt));
  const [endsAt, setEndsAt] = useState(() => toDatetimeLocalValue(initialEndsAt));
  const [mode, setMode] = useState<CampaignMode>(initialMode);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setSuccess(false);

    try {
      const response = await fetch("/api/admin/campaign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startsAt: startsAt ? new Date(startsAt).toISOString() : null,
          endsAt: endsAt ? new Date(endsAt).toISOString() : null,
          mode,
          reason,
        }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setError(body?.error ?? "캠페인 설정을 변경할 수 없습니다.");
        return;
      }

      setSuccess(true);
      setReason("");
      router.refresh();
    } catch {
      setError("서버에 연결할 수 없습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <div className={styles.formRow}>
        <label className={styles.formLabel} htmlFor="starts-at">
          시작 시각 (비워두면 즉시 시작)
        </label>
        <input
          id="starts-at"
          type="datetime-local"
          className={styles.input}
          value={startsAt}
          onChange={(event) => setStartsAt(event.target.value)}
        />
      </div>

      <div className={styles.formRow}>
        <label className={styles.formLabel} htmlFor="ends-at">
          종료 시각 (비워두면 종료 없음)
        </label>
        <input
          id="ends-at"
          type="datetime-local"
          className={styles.input}
          value={endsAt}
          onChange={(event) => setEndsAt(event.target.value)}
        />
      </div>

      <div className={styles.formRow}>
        <label className={styles.formLabel} htmlFor="mode">
          모드
        </label>
        <select
          id="mode"
          className={styles.select}
          value={mode}
          onChange={(event) => setMode(event.target.value as CampaignMode)}
        >
          <option value="active">active — 투표/공유 전체 허용</option>
          <option value="protected">protected — 최소 세션만 허용</option>
          <option value="read_only">read_only — 읽기 전용</option>
        </select>
      </div>

      <div className={styles.formRow}>
        <label className={styles.formLabel} htmlFor="reason">
          변경 사유 (필수, 기록됨)
        </label>
        <textarea
          id="reason"
          className={styles.textarea}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          required
          minLength={1}
          maxLength={500}
        />
      </div>

      <button type="submit" className={styles.button} disabled={submitting || reason.trim().length === 0}>
        {submitting ? "적용 중..." : "캠페인 설정 적용"}
      </button>

      {error ? <p className={styles.formError}>{error}</p> : null}
      {success ? <p className={styles.formSuccess}>적용되었습니다.</p> : null}
    </form>
  );
}

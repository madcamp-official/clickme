import type { CampaignMode } from "../../../lib/server/database.types";

import styles from "./dashboard.module.css";

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Session/cohort/share dates are plain Postgres `date` values (e.g.
// "2026-07-19") already computed in Asia/Seoul by the view. Routing them
// through `new Date()` + toLocaleString would reinterpret the bare date as
// UTC midnight and tack on a spurious time-of-day, so this formats the
// digits directly instead.
export function formatDateOnly(value: string | null | undefined): string {
  if (!value) return "—";
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return "—";
  const [, year, month, day] = match;
  return `${year}. ${month}. ${day}.`;
}

export function hoursAgoIso(hours: number): string {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

export function formatNumber(value: number | null | undefined): string {
  return typeof value === "number" && Number.isFinite(value) ? value.toLocaleString("ko-KR") : "—";
}

const CAMPAIGN_MODE_LABEL: Record<CampaignMode, string> = {
  active: "진행 중",
  protected: "보호됨",
  read_only: "읽기 전용",
};

const CAMPAIGN_MODE_BADGE_CLASS: Record<CampaignMode, string> = {
  active: styles.badgeActive,
  protected: styles.badgeProtected,
  read_only: styles.badgeReadOnly,
};

export function campaignModeLabel(mode: CampaignMode): string {
  return CAMPAIGN_MODE_LABEL[mode];
}

export function campaignModeBadgeClassName(mode: CampaignMode): string {
  return `${styles.badge} ${CAMPAIGN_MODE_BADGE_CLASS[mode]}`;
}

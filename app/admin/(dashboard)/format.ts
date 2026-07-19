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

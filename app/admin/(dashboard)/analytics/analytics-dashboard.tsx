"use client";

import { useMemo, useState } from "react";

import { formatDateOnly, formatNumber } from "../format";
import { ViewTable } from "../view-table";
import { SECTION_CONFIGS } from "./columns";
import styles from "./analytics.module.css";
import dashboardStyles from "../dashboard.module.css";

type Section = { key: string; rows: Array<Record<string, unknown>> };

const ALL = "all" as const;

export function AnalyticsDashboard({ sections }: { sections: Section[] }) {
  const rowsByKey = useMemo(() => new Map(sections.map((section) => [section.key, section.rows])), [sections]);

  const availableDates = useMemo(() => {
    const dates = new Set<string>();
    for (const config of SECTION_CONFIGS) {
      if (!config.dateKey) continue;
      for (const row of rowsByKey.get(config.key) ?? []) {
        const value = row[config.dateKey];
        if (typeof value === "string") dates.add(value);
      }
    }
    return Array.from(dates).sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
  }, [rowsByKey]);

  const [selectedDate, setSelectedDate] = useState<string>(availableDates[0] ?? ALL);

  const dailyFunnelRow = useMemo(() => {
    if (selectedDate === ALL) return null;
    const rows = rowsByKey.get("daily_funnel") ?? [];
    return rows.find((row) => row.session_date === selectedDate) ?? null;
  }, [rowsByKey, selectedDate]);

  return (
    <>
      <div className={styles.dateTabs}>
        <button
          type="button"
          className={selectedDate === ALL ? `${styles.dateTab} ${styles.dateTabActive}` : styles.dateTab}
          onClick={() => setSelectedDate(ALL)}
        >
          전체 기간
        </button>
        {availableDates.map((date) => (
          <button
            key={date}
            type="button"
            className={selectedDate === date ? `${styles.dateTab} ${styles.dateTabActive}` : styles.dateTab}
            onClick={() => setSelectedDate(date)}
          >
            {formatDateOnly(date)}
          </button>
        ))}
      </div>

      {selectedDate !== ALL ? (
        <section className={dashboardStyles.section}>
          <h2 className={dashboardStyles.sectionTitle}>{formatDateOnly(selectedDate)} 요약</h2>
          {dailyFunnelRow ? (
            <div className={dashboardStyles.cardGrid}>
              <div className={dashboardStyles.card}>
                <p className={dashboardStyles.cardLabel}>방문자</p>
                <p className={dashboardStyles.cardValue}>{formatNumber(dailyFunnelRow.visitors as number)}</p>
                <p className={dashboardStyles.cardHint}>신규 {formatNumber(dailyFunnelRow.new_visitors as number)}</p>
              </div>
              <div className={dashboardStyles.card}>
                <p className={dashboardStyles.cardLabel}>투표 참여자</p>
                <p className={dashboardStyles.cardValue}>{formatNumber(dailyFunnelRow.activated_visitors as number)}</p>
                <p className={dashboardStyles.cardHint}>총 투표수 {formatNumber(dailyFunnelRow.successful_votes as number)}</p>
              </div>
              <div className={dashboardStyles.card}>
                <p className={dashboardStyles.cardLabel}>세션</p>
                <p className={dashboardStyles.cardValue}>{formatNumber(dailyFunnelRow.sessions as number)}</p>
                <p className={dashboardStyles.cardHint}>페이지뷰 {formatNumber(dailyFunnelRow.page_views as number)}</p>
              </div>
              <div className={dashboardStyles.card}>
                <p className={dashboardStyles.cardLabel}>공유 링크 생성</p>
                <p className={dashboardStyles.cardValue}>{formatNumber(dailyFunnelRow.share_links_created as number)}</p>
              </div>
            </div>
          ) : (
            <p className={dashboardStyles.empty}>이 날짜에는 방문 데이터가 없습니다.</p>
          )}
        </section>
      ) : null}

      {SECTION_CONFIGS.map((config) => {
        const rows = rowsByKey.get(config.key) ?? [];
        const filteredRows =
          selectedDate === ALL || !config.dateKey ? rows : rows.filter((row) => row[config.dateKey!] === selectedDate);

        return (
          <section key={config.key} className={dashboardStyles.section}>
            <h2 className={dashboardStyles.sectionTitle}>
              {config.title}
              {selectedDate !== ALL && !config.dateKey ? (
                <span className={styles.sectionNote}>날짜와 무관 · 전체 기간 집계</span>
              ) : null}
            </h2>
            <ViewTable rows={filteredRows} columns={config.columns} />
          </section>
        );
      })}
    </>
  );
}

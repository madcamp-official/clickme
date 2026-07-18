import type { Choice, TopicHistoryEntry, TopicHistoryResponse } from "./contracts";

export type TopicHistoryRow = {
  id: string;
  title: string;
  option_a_label: string;
  option_a_choice: Choice;
  option_a_count: number;
  option_b_label: string;
  option_b_choice: Choice;
  option_b_count: number;
  starts_at: string | null;
  ends_at: string | null;
  archived_at: string;
};

function safeCount(value: number): number {
  return Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

export function formatTopicHistory(rows: TopicHistoryRow[]): TopicHistoryResponse {
  const topics: TopicHistoryEntry[] = rows.map((row) => ({
    id: row.id,
    title: row.title,
    optionALabel: row.option_a_label,
    optionAChoice: row.option_a_choice,
    optionACount: safeCount(Number(row.option_a_count)),
    optionBLabel: row.option_b_label,
    optionBChoice: row.option_b_choice,
    optionBCount: safeCount(Number(row.option_b_count)),
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    archivedAt: row.archived_at,
  }));

  return { topics };
}

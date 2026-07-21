import type { Json } from "./database.types";
import { isTeamChoice, type TeamTopicHistoryEntry, type TeamTopicHistoryResponse, type TeamTopicHistoryResult } from "./contracts";

export type TeamTopicHistoryRow = {
  id: string;
  title: string;
  archived_at: string;
  results: Json;
};

function safeCount(value: unknown): number {
  const num = Number(value);
  return Number.isSafeInteger(num) && num >= 0 ? num : 0;
}

function parseResults(value: Json): TeamTopicHistoryResult[] {
  if (!Array.isArray(value)) return [];

  const results: TeamTopicHistoryResult[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const choice = (entry as Record<string, unknown>).choice;
    const label = (entry as Record<string, unknown>).label;
    const voteCount = (entry as Record<string, unknown>).voteCount;
    if (!isTeamChoice(choice) || typeof label !== "string") continue;
    results.push({ choice, label, voteCount: safeCount(voteCount) });
  }
  return results;
}

export function formatTeamTopicHistory(rows: TeamTopicHistoryRow[]): TeamTopicHistoryResponse {
  const topics: TeamTopicHistoryEntry[] = rows.map((row) => ({
    id: row.id,
    title: row.title,
    archivedAt: row.archived_at,
    results: parseResults(row.results),
  }));

  return { topics };
}

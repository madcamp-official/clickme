import type { CampaignStatus, TeamChoice, TeamVoteResults } from "./contracts";
import { TEAM_CHOICES } from "./contracts";

export type TeamVoteResultRow = {
  choice: TeamChoice;
  vote_count: number;
  campaign_id: string;
  campaign_status: CampaignStatus;
  starts_at: string | null;
  ends_at: string | null;
  revision: number;
};

function safeCount(value: number): number {
  return Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

// get_public_team_vote_results returns one row per team (10 rows), each
// repeating the same campaign metadata -- unlike the binary
// get_public_vote_results, which packs counts and campaign into one row.
export function formatTeamVoteResults(rows: TeamVoteResultRow[]): TeamVoteResults {
  const counts = Object.fromEntries(TEAM_CHOICES.map((choice) => [choice, 0])) as Record<TeamChoice, number>;
  let total = 0;

  for (const row of rows) {
    const count = safeCount(Number(row.vote_count));
    counts[row.choice] = count;
    total += count;
  }

  const first = rows[0];
  return {
    counts,
    total,
    campaign: {
      id: first?.campaign_id ?? "",
      status: first?.campaign_status ?? "read_only",
      startsAt: first?.starts_at ?? null,
      endsAt: first?.ends_at ?? null,
      revision: first?.revision ?? 0,
    },
  };
}

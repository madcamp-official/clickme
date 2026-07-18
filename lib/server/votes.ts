import type { CampaignStatus, VoteResults } from "./contracts";

export type VoteResultRow = {
  dip_count: number;
  pour_count: number;
  total_count: number;
  campaign_id: string;
  campaign_status: CampaignStatus;
  starts_at: string | null;
  ends_at: string | null;
  revision: number;
};

function safeCount(value: number): number {
  return Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

export function formatVoteResults(row: VoteResultRow): VoteResults {
  const dip = safeCount(Number(row.dip_count));
  const pour = safeCount(Number(row.pour_count));
  const total = safeCount(Number(row.total_count));

  const dipPercentage = total === 0 ? 0 : Math.round((dip / total) * 100);

  return {
    counts: { dip, pour, total },
    percentages: {
      dip: dipPercentage,
      pour: total === 0 ? 0 : 100 - dipPercentage,
    },
    campaign: {
      id: row.campaign_id,
      status: row.campaign_status,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      revision: row.revision,
    },
  };
}

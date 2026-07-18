export const CHOICES = ["dip", "pour"] as const;

export type Choice = (typeof CHOICES)[number];

export type VoteCounts = {
  dip: number;
  pour: number;
  total: number;
};

export type VoteResults = {
  counts: VoteCounts;
  percentages: Pick<VoteCounts, "dip" | "pour">;
  campaign: CampaignState;
};

export type CampaignStatus = "active" | "protected" | "read_only";

export type CampaignState = {
  id: string;
  status: CampaignStatus;
  startsAt: string | null;
  endsAt: string | null;
  revision: number;
};

export type ApiError = {
  error: string;
  code?: string;
};

export function isChoice(value: unknown): value is Choice {
  return typeof value === "string" && CHOICES.includes(value as Choice);
}

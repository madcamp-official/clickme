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

export type CommentEntry = {
  id: string;
  choice: Choice;
  body: string;
  createdAt: string;
};

export type CommentsResponse = {
  comments: CommentEntry[];
};

export type TopicHistoryEntry = {
  id: string;
  title: string;
  optionALabel: string;
  optionAChoice: Choice;
  optionACount: number;
  optionBLabel: string;
  optionBChoice: Choice;
  optionBCount: number;
  startsAt: string | null;
  endsAt: string | null;
  archivedAt: string;
};

export type TopicHistoryResponse = {
  topics: TopicHistoryEntry[];
};

export function isChoice(value: unknown): value is Choice {
  return typeof value === "string" && CHOICES.includes(value as Choice);
}

// N-way (KBO team) voting. Deliberately a separate choice space from
// Choice/CHOICES above -- see supabase/migrations/20260721000000_add_team_voting.sql
// for why this isn't just CHOICES extended to 10 values.
export const TEAM_CHOICES = [
  "kia", "samsung", "lg", "doosan", "kt", "ssg", "lotte", "hanwha", "nc", "kiwoom",
] as const;

export type TeamChoice = (typeof TEAM_CHOICES)[number];

export function isTeamChoice(value: unknown): value is TeamChoice {
  return typeof value === "string" && TEAM_CHOICES.includes(value as TeamChoice);
}

export type TeamVoteCounts = Record<TeamChoice, number>;

export type TeamVoteResults = {
  counts: TeamVoteCounts;
  total: number;
  campaign: CampaignState;
};

export type TeamCommentEntry = {
  id: string;
  choice: TeamChoice;
  body: string;
  createdAt: string;
};

export type TeamCommentsResponse = {
  comments: TeamCommentEntry[];
};

export type TeamTopicHistoryResult = {
  choice: TeamChoice;
  label: string;
  voteCount: number;
};

export type TeamTopicHistoryEntry = {
  id: string;
  title: string;
  archivedAt: string;
  results: TeamTopicHistoryResult[];
};

export type TeamTopicHistoryResponse = {
  topics: TeamTopicHistoryEntry[];
};

import type { TeamChoice, TeamCommentEntry, TeamCommentsResponse } from "./contracts";

export type TeamCommentRow = {
  id: string;
  choice: TeamChoice;
  body: string;
  created_at: string;
};

export function formatTeamComments(rows: TeamCommentRow[]): TeamCommentsResponse {
  const comments: TeamCommentEntry[] = rows.map((row) => ({
    id: row.id,
    choice: row.choice,
    body: row.body,
    createdAt: row.created_at,
  }));

  return { comments };
}

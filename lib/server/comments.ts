import type { Choice, CommentEntry, CommentsResponse } from "./contracts";

export type CommentRow = {
  id: string;
  choice: Choice;
  body: string;
  created_at: string;
};

export function formatComments(rows: CommentRow[]): CommentsResponse {
  const comments: CommentEntry[] = rows.map((row) => ({
    id: row.id,
    choice: row.choice,
    body: row.body,
    createdAt: row.created_at,
  }));

  return { comments };
}

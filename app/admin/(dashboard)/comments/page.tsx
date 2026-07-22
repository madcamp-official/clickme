import { getSupabaseAdmin } from "../../../../lib/server/supabase";
import styles from "../dashboard.module.css";
import { formatDateTime } from "../format";
import { CommentDeleteButton } from "./comment-delete-button";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// comments and team_comments are fully separate tables (20260721000000).
// Both are fetched and merged by created_at so moderators see (and can
// delete) today's team-voting comments alongside any binary ones, instead
// of team comments being invisible here entirely.
export default async function AdminCommentsPage() {
  const supabase = getSupabaseAdmin();
  const [binary, team] = await Promise.all([
    supabase.from("comments").select("id, choice, body, created_at").order("created_at", { ascending: false }).limit(50),
    supabase.from("team_comments").select("id, choice, body, created_at").order("created_at", { ascending: false }).limit(50),
  ]);

  const comments = [...(binary.data ?? []), ...(team.data ?? [])]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 50);

  return (
    <>
      <h1 className={styles.heading}>댓글 모더레이션</h1>
      <p className={styles.pageHint}>최근 50건입니다 (이진 + 팀 통합). 삭제하면 되돌릴 수 없습니다.</p>
      {comments.length > 0 ? (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>선택</th>
                <th>내용</th>
                <th>작성 시각</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {comments.map((comment) => (
                <tr key={comment.id}>
                  <td>{comment.choice}</td>
                  <td className={styles.wrapCell}>{comment.body}</td>
                  <td>{formatDateTime(comment.created_at)}</td>
                  <td>
                    <CommentDeleteButton id={comment.id} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className={styles.empty}>댓글이 없습니다.</p>
      )}
    </>
  );
}

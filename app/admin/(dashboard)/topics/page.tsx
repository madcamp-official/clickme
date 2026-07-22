import { getSupabaseAdmin } from "../../../../lib/server/supabase";
import styles from "../dashboard.module.css";
import { formatDateTime, formatNumber } from "../format";
import { TeamTopicArchiveForm } from "./team-topic-archive-form";
import { TopicArchiveForm } from "./topic-archive-form";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminTopicsPage() {
  const supabase = getSupabaseAdmin();
  const [{ data }, { data: teamData }] = await Promise.all([
    supabase.rpc("list_public_topic_history", { p_limit: 50 }),
    supabase.rpc("list_public_team_topic_history", { p_limit: 50 }),
  ]);
  const topics = data ?? [];
  const teamTopics = teamData ?? [];

  return (
    <>
      <h1 className={styles.heading}>주제 아카이브</h1>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>새 팀 라운드 시작</h2>
        <TeamTopicArchiveForm />
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>지난 팀 주제</h2>
        {teamTopics.length > 0 ? (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>제목</th>
                  <th>결과</th>
                  <th>마감 시각</th>
                </tr>
              </thead>
              <tbody>
                {teamTopics.map((topic) => {
                  const results = Array.isArray(topic.results)
                    ? (topic.results as Array<{ choice: string; label: string; voteCount: number }>)
                    : [];
                  const ranked = [...results].sort((a, b) => b.voteCount - a.voteCount);
                  return (
                    <tr key={topic.id}>
                      <td className={styles.wrapCell}>{topic.title}</td>
                      <td>{ranked.map((r) => `${r.label} ${formatNumber(r.voteCount)}`).join(" · ")}</td>
                      <td>{formatDateTime(topic.archived_at)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className={styles.empty}>아카이브된 팀 주제가 없습니다.</p>
        )}
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>새 이진 라운드 시작</h2>
        <TopicArchiveForm />
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>지난 이진 주제</h2>
        {topics.length > 0 ? (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>제목</th>
                  <th>결과</th>
                  <th>기간</th>
                  <th>마감 시각</th>
                </tr>
              </thead>
              <tbody>
                {topics.map((topic) => (
                  <tr key={topic.id}>
                    <td className={styles.wrapCell}>{topic.title}</td>
                    <td>
                      {topic.option_a_label} {formatNumber(topic.option_a_count)} : {formatNumber(topic.option_b_count)}{" "}
                      {topic.option_b_label}
                    </td>
                    <td>
                      {formatDateTime(topic.starts_at)} ~ {formatDateTime(topic.ends_at)}
                    </td>
                    <td>{formatDateTime(topic.archived_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className={styles.empty}>아카이브된 주제가 없습니다.</p>
        )}
      </section>
    </>
  );
}

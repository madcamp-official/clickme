import { getSupabaseAdmin } from "../../../lib/server/supabase";
import styles from "./dashboard.module.css";
import { campaignModeBadgeClassName, campaignModeLabel, formatDateTime, formatNumber, hoursAgoIso } from "./format";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminOverviewPage() {
  const supabase = getSupabaseAdmin();

  const [voteResults, teamVoteResults, dailyFunnel, recentTopics, recentTeamTopics, attemptCounts] = await Promise.all([
    supabase.rpc("get_public_vote_results").single(),
    supabase.rpc("get_public_team_vote_results"),
    supabase
      .from("analytics_daily_funnel")
      .select("*")
      .order("session_date", { ascending: false })
      .limit(1),
    supabase.rpc("list_public_topic_history", { p_limit: 3 }),
    supabase.rpc("list_public_team_topic_history", { p_limit: 3 }),
    Promise.all([
      supabase
        .from("comment_attempts")
        .select("*", { count: "exact", head: true })
        .gte("created_at", hoursAgoIso(24)),
      supabase
        .from("comment_attempts")
        .select("*", { count: "exact", head: true })
        .eq("outcome", "accepted")
        .gte("created_at", hoursAgoIso(24)),
    ]),
  ]);

  const results = voteResults.data;
  const teamResults = teamVoteResults.data ?? [];
  const teamTotalVotes = teamResults.reduce((sum, row) => sum + row.vote_count, 0);
  const teamLeader = teamResults.length > 0
    ? teamResults.reduce((max, row) => (row.vote_count > max.vote_count ? row : max))
    : null;
  const todayFunnel = dailyFunnel.data?.[0] ?? null;
  const topics = recentTopics.data ?? [];
  const teamTopics = recentTeamTopics.data ?? [];
  const [totalAttempts, acceptedAttempts] = attemptCounts;

  return (
    <>
      <h1 className={styles.heading}>개요</h1>

      <div className={styles.cardGrid}>
        <div className={styles.card}>
          <p className={styles.cardLabel}>캠페인 상태</p>
          <p className={styles.cardValue}>
            {results ? (
              <span className={campaignModeBadgeClassName(results.campaign_status)}>
                {campaignModeLabel(results.campaign_status)}
              </span>
            ) : (
              "—"
            )}
          </p>
          <p className={styles.cardHint}>
            {results ? `${formatDateTime(results.starts_at)} ~ ${formatDateTime(results.ends_at)}` : "불러올 수 없음"}
          </p>
        </div>

        <div className={styles.card}>
          <p className={styles.cardLabel}>전체 투표수 (이진)</p>
          <p className={styles.cardValue}>{formatNumber(results?.total_count)}</p>
          <p className={styles.cardHint}>
            DIP {formatNumber(results?.dip_count)} · POUR {formatNumber(results?.pour_count)}
          </p>
        </div>

        <div className={styles.card}>
          <p className={styles.cardLabel}>전체 투표수 (팀)</p>
          <p className={styles.cardValue}>{formatNumber(teamTotalVotes)}</p>
          <p className={styles.cardHint}>
            {teamLeader ? `1위 ${teamLeader.choice} · ${formatNumber(teamLeader.vote_count)}표` : "투표 없음"}
          </p>
        </div>

        <div className={styles.card}>
          <p className={styles.cardLabel}>오늘 방문자</p>
          <p className={styles.cardValue}>{formatNumber(todayFunnel?.visitors)}</p>
          <p className={styles.cardHint}>신규 {formatNumber(todayFunnel?.new_visitors)}</p>
        </div>

        <div className={styles.card}>
          <p className={styles.cardLabel}>오늘 댓글 시도</p>
          <p className={styles.cardValue}>{formatNumber(totalAttempts.count)}</p>
          <p className={styles.cardHint}>승인 {formatNumber(acceptedAttempts.count)}</p>
        </div>
      </div>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>오늘의 퍼널</h2>
        {todayFunnel ? (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <tbody>
                <tr>
                  <th>세션</th>
                  <td>{formatNumber(todayFunnel.sessions)}</td>
                  <th>페이지뷰</th>
                  <td>{formatNumber(todayFunnel.page_views)}</td>
                </tr>
                <tr>
                  <th>투표 완료 방문자</th>
                  <td>{formatNumber(todayFunnel.activated_visitors)}</td>
                  <th>공유 링크 생성</th>
                  <td>{formatNumber(todayFunnel.share_links_created)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        ) : (
          <p className={styles.empty}>오늘 집계된 데이터가 없습니다.</p>
        )}
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>최근 주제</h2>
        {topics.length > 0 ? (
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
                {topics.map((topic) => (
                  <tr key={topic.id}>
                    <td>{topic.title}</td>
                    <td>
                      {topic.option_a_label} {formatNumber(topic.option_a_count)} : {formatNumber(topic.option_b_count)}{" "}
                      {topic.option_b_label}
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

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>최근 팀 주제</h2>
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
                      <td>{topic.title}</td>
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
    </>
  );
}

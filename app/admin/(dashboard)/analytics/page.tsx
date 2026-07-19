import { getSupabaseAdmin } from "../../../../lib/server/supabase";
import styles from "../dashboard.module.css";
import { ViewTable } from "../view-table";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const ROW_LIMIT = 30;

export default async function AdminAnalyticsPage() {
  const supabase = getSupabaseAdmin();

  const [dailyFunnel, acquisition, engagement, retention, referralFunnel, ctaExperiment, dataQuality] =
    await Promise.all([
      supabase.from("analytics_daily_funnel").select("*").order("session_date", { ascending: false }).limit(ROW_LIMIT),
      supabase.from("analytics_acquisition").select("*").order("session_date", { ascending: false }).limit(ROW_LIMIT),
      supabase.from("analytics_engagement").select("*").order("session_date", { ascending: false }).limit(ROW_LIMIT),
      supabase.from("analytics_retention").select("*").order("cohort_date", { ascending: false }).limit(ROW_LIMIT),
      supabase
        .from("analytics_referral_funnel")
        .select("*")
        .order("share_date", { ascending: false })
        .limit(ROW_LIMIT),
      supabase.from("analytics_cta_experiment").select("*").order("experiment_variant", { ascending: true }),
      supabase.from("analytics_data_quality").select("*").order("measured_date", { ascending: false }).limit(ROW_LIMIT),
    ]);

  const sections: Array<{ title: string; rows: Array<Record<string, unknown>> }> = [
    { title: "일별 퍼널 (analytics_daily_funnel)", rows: dailyFunnel.data ?? [] },
    { title: "유입 채널 (analytics_acquisition)", rows: acquisition.data ?? [] },
    { title: "참여도 (analytics_engagement)", rows: engagement.data ?? [] },
    { title: "리텐션 (analytics_retention)", rows: retention.data ?? [] },
    { title: "추천 링크 퍼널 (analytics_referral_funnel)", rows: referralFunnel.data ?? [] },
    { title: "A/B 실험 (analytics_cta_experiment)", rows: ctaExperiment.data ?? [] },
    { title: "데이터 품질 점검 (analytics_data_quality)", rows: dataQuality.data ?? [] },
  ];

  return (
    <>
      <h1 className={styles.heading}>분석</h1>
      {sections.map((section) => (
        <section key={section.title} className={styles.section}>
          <h2 className={styles.sectionTitle}>{section.title}</h2>
          <ViewTable rows={section.rows} />
        </section>
      ))}
    </>
  );
}

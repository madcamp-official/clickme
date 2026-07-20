import { getSupabaseAdmin } from "../../../../lib/server/supabase";
import styles from "../dashboard.module.css";
import { AnalyticsDashboard } from "./analytics-dashboard";

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

  const sections = [
    { key: "daily_funnel", rows: dailyFunnel.data ?? [] },
    { key: "acquisition", rows: acquisition.data ?? [] },
    { key: "engagement", rows: engagement.data ?? [] },
    { key: "retention", rows: retention.data ?? [] },
    { key: "referral_funnel", rows: referralFunnel.data ?? [] },
    { key: "cta_experiment", rows: ctaExperiment.data ?? [] },
    { key: "data_quality", rows: dataQuality.data ?? [] },
  ];

  return (
    <>
      <h1 className={styles.heading}>분석</h1>
      <AnalyticsDashboard sections={sections} />
    </>
  );
}

import { getSupabaseAdmin } from "../../../../lib/server/supabase";
import styles from "../dashboard.module.css";
import { campaignModeBadgeClassName, campaignModeLabel, formatDateTime } from "../format";
import { CampaignWindowForm } from "./campaign-window-form";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminCampaignPage() {
  const supabase = getSupabaseAdmin();

  const [settingsResult, historyResult] = await Promise.all([
    supabase.from("campaign_settings").select("*").eq("singleton", true).single(),
    supabase
      .from("campaign_settings_history")
      .select("*")
      .order("changed_at", { ascending: false })
      .limit(20),
  ]);

  const settings = settingsResult.data;
  const history = historyResult.data ?? [];

  return (
    <>
      <h1 className={styles.heading}>캠페인 제어</h1>

      {settings ? (
        <div className={styles.cardGrid}>
          <div className={styles.card}>
            <p className={styles.cardLabel}>현재 모드</p>
            <p className={styles.cardValue}>
              <span className={campaignModeBadgeClassName(settings.mode)}>{campaignModeLabel(settings.mode)}</span>
            </p>
          </div>
          <div className={styles.card}>
            <p className={styles.cardLabel}>기간</p>
            <p className={styles.cardValueSmall}>
              {formatDateTime(settings.starts_at)} ~ {formatDateTime(settings.ends_at)}
            </p>
          </div>
          <div className={styles.card}>
            <p className={styles.cardLabel}>revision</p>
            <p className={styles.cardValue}>{settings.revision}</p>
          </div>
        </div>
      ) : (
        <p className={styles.empty}>캠페인 설정을 불러올 수 없습니다.</p>
      )}

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>기간·모드 변경</h2>
        {settings ? (
          <CampaignWindowForm
            initialStartsAt={settings.starts_at}
            initialEndsAt={settings.ends_at}
            initialMode={settings.mode}
          />
        ) : null}
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>변경 이력</h2>
        {history.length > 0 ? (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>변경 시각</th>
                  <th>이전 → 이후 모드</th>
                  <th>이전 → 이후 기간</th>
                  <th>사유</th>
                  <th>변경자</th>
                </tr>
              </thead>
              <tbody>
                {history.map((entry) => (
                  <tr key={entry.id}>
                    <td>{formatDateTime(entry.changed_at)}</td>
                    <td>
                      {entry.previous_mode} → {entry.new_mode}
                    </td>
                    <td>
                      {formatDateTime(entry.previous_starts_at)} ~ {formatDateTime(entry.previous_ends_at)} →{" "}
                      {formatDateTime(entry.new_starts_at)} ~ {formatDateTime(entry.new_ends_at)}
                    </td>
                    <td className={styles.wrapCell}>{entry.reason}</td>
                    <td>{entry.changed_by}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className={styles.empty}>변경 이력이 없습니다.</p>
        )}
      </section>
    </>
  );
}

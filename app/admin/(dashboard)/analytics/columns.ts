export type ColumnDef = {
  key: string;
  label: string;
  percent?: boolean;
  boolLabels?: readonly [string, string];
};

export type SectionConfig = {
  key: string;
  title: string;
  dateKey: string | null;
  columns: ColumnDef[];
};

export const SECTION_CONFIGS: SectionConfig[] = [
  {
    key: "daily_funnel",
    title: "일별 퍼널",
    dateKey: "session_date",
    columns: [
      { key: "session_date", label: "날짜" },
      { key: "visitors", label: "방문자" },
      { key: "new_visitors", label: "신규 방문자" },
      { key: "returning_visitors", label: "재방문자" },
      { key: "sessions", label: "세션" },
      { key: "page_views", label: "페이지뷰" },
      { key: "same_day_reentering_visitors", label: "당일 재접속자" },
      { key: "activated_visitors", label: "투표 참여자" },
      { key: "successful_votes", label: "총 투표수" },
      { key: "share_links_created", label: "공유 링크 생성" },
    ],
  },
  {
    key: "acquisition",
    title: "유입 채널",
    dateKey: "session_date",
    columns: [
      { key: "session_date", label: "날짜" },
      { key: "utm_source", label: "유입 소스" },
      { key: "utm_medium", label: "유입 매체" },
      { key: "utm_campaign", label: "캠페인명" },
      { key: "referrer_host", label: "리퍼러" },
      { key: "visitors", label: "방문자" },
      { key: "activated_visitors", label: "투표 참여자" },
      { key: "successful_votes", label: "총 투표수" },
      { key: "visitor_vote_conversion_rate", label: "투표 전환율", percent: true },
    ],
  },
  {
    key: "engagement",
    title: "참여도",
    dateKey: "session_date",
    columns: [
      { key: "session_date", label: "날짜" },
      { key: "sessions", label: "세션" },
      { key: "active_ms_p50", label: "활성시간 중앙값(ms)" },
      { key: "active_ms_p75", label: "활성시간 75%(ms)" },
      { key: "average_max_scroll_percent", label: "평균 최대 스크롤(%)" },
      { key: "engaged_sessions", label: "참여 세션" },
    ],
  },
  {
    key: "retention",
    title: "리텐션",
    dateKey: "cohort_date",
    columns: [
      { key: "cohort_date", label: "코호트 날짜" },
      { key: "cohort_visitors", label: "코호트 방문자" },
      { key: "d1_returning_visitors", label: "D+1 재방문자" },
      { key: "d2_returning_visitors", label: "D+2 재방문자" },
    ],
  },
  {
    key: "referral_funnel",
    title: "추천 링크 퍼널",
    dateKey: "share_date",
    columns: [
      { key: "share_date", label: "날짜" },
      { key: "share_card_impressions", label: "공유카드 노출" },
      { key: "share_cta_clicks", label: "공유 버튼 클릭" },
      { key: "links_created", label: "링크 생성" },
      { key: "external_arrivals", label: "외부 유입" },
      { key: "external_referral_sessions", label: "추천 세션" },
      { key: "external_referral_visitors", label: "추천 방문자" },
      { key: "fixed_attributed_visitors", label: "귀속 방문자" },
      { key: "attributed_successful_votes", label: "귀속 투표수" },
      { key: "referred_activated_visitors", label: "추천 투표 참여자" },
    ],
  },
  {
    key: "cta_experiment",
    title: "A/B 실험",
    dateKey: null,
    columns: [
      { key: "experiment_variant", label: "실험 변형" },
      { key: "visitors", label: "방문자" },
      { key: "activated_visitors", label: "투표 참여자" },
      { key: "share_card_impressions", label: "공유카드 노출" },
      { key: "share_cta_clicks", label: "공유 버튼 클릭" },
      { key: "links_created", label: "링크 생성" },
      { key: "sharing_visitors", label: "공유한 방문자" },
      { key: "external_arrivals", label: "외부 유입" },
      { key: "referred_visitors", label: "추천된 방문자" },
      { key: "attributed_successful_votes", label: "귀속 투표수" },
    ],
  },
  {
    key: "data_quality",
    title: "데이터 품질 점검",
    dateKey: "measured_date",
    columns: [
      { key: "measured_date", label: "날짜" },
      { key: "vote_rows", label: "투표 행 수" },
      { key: "votes_with_session", label: "세션 연결됨" },
      { key: "votes_with_page_view", label: "페이지뷰 연결됨" },
      { key: "unique_events", label: "이벤트 수" },
      { key: "client_error_events", label: "클라이언트 오류 이벤트" },
      { key: "events_without_page_view", label: "페이지뷰 미연결 이벤트" },
      { key: "page_views", label: "페이지뷰" },
      { key: "page_views_without_heartbeat", label: "하트비트 없음" },
      { key: "shard_vote_count", label: "샤드 집계 투표수" },
      { key: "shard_count_matches", label: "샤드 일치 여부", boolLabels: ["일치", "불일치"] },
      { key: "vote_session_link_rate", label: "세션 연결율", percent: true },
      { key: "vote_page_view_link_rate", label: "페이지뷰 연결율", percent: true },
      { key: "client_error_event_rate", label: "오류 이벤트 비율", percent: true },
      { key: "page_view_heartbeat_missing_rate", label: "하트비트 누락율", percent: true },
    ],
  },
];

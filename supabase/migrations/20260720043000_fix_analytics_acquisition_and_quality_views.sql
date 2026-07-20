begin;

-- analytics_acquisition joined raw votes rows to analytics_sessions before
-- aggregating (LEFT JOIN votes ON votes.session_id = sessions.id, GROUP BY
-- afterwards). This is a rapid-click balance game: votes has 270k+ rows
-- against 301 sessions, so a single session's join fanned out to thousands
-- of duplicate rows before the GROUP BY collapsed them back down. That
-- produced a ~254k-row intermediate result with an on-disk sort (~46MB) and
-- made the admin analytics page take 1.3-1.9s on this view alone, most of
-- the page's total load time. Every sibling daily view (analytics_daily_funnel
-- etc.) already pre-aggregates votes per session in a CTE before joining;
-- this brings analytics_acquisition in line with that pattern. Output columns
-- and semantics are unchanged -- only the join order.
create or replace view public.analytics_acquisition
with (security_invoker = true)
as
with session_votes as (
  select
    votes.session_id,
    count(*)::bigint as vote_count
  from public.votes as votes
  join public.analytics_page_views as vote_page
    on vote_page.id = votes.page_view_id
   and vote_page.analytics_enabled
  where votes.session_id is not null
  group by votes.session_id
)
select
  sessions.campaign_id,
  sessions.session_date,
  coalesce(sessions.utm_source, '(direct)') as utm_source,
  coalesce(sessions.utm_medium, '(none)') as utm_medium,
  sessions.utm_campaign,
  sessions.referrer_host,
  count(distinct sessions.visitor_hash)::bigint as visitors,
  count(distinct sessions.visitor_hash) filter (
    where coalesce(session_votes.vote_count, 0) > 0
  )::bigint as activated_visitors,
  coalesce(sum(session_votes.vote_count), 0)::bigint as successful_votes,
  round(
    count(distinct sessions.visitor_hash) filter (
      where coalesce(session_votes.vote_count, 0) > 0
    )::numeric
      / nullif(count(distinct sessions.visitor_hash), 0),
    4
  ) as visitor_vote_conversion_rate
from public.analytics_sessions as sessions
left join session_votes on session_votes.session_id = sessions.id
where sessions.analytics_enabled
group by
  sessions.campaign_id,
  sessions.session_date,
  sessions.utm_source,
  sessions.utm_medium,
  sessions.utm_campaign,
  sessions.referrer_host;

-- analytics_data_quality stamped every row with clock_timestamp()'s date
-- while aggregating votes/events/page_views over all time (GROUP BY
-- campaign_id only). It could never show a previous day -- the admin
-- "분석" page's other six sections all break down by day, so this one
-- section looked broken next to them. Rebuild it to bucket votes, events,
-- and page views by their own per-row timestamp (Asia/Seoul date), matching
-- the pattern used everywhere else.
--
-- vote_count_shards has no timestamp of its own -- it is a live running
-- counter, not a historical log -- so shard_vote_count/shard_count_matches
-- stay what they always were: a same-moment sanity check between the shard
-- counters and the lifetime vote count. That comparison is only meaningful
-- against "right now", so it is reported once, on the most recent measured
-- day, and left null on historical rows rather than repeating a misleading
-- lifetime total on every past day.
create or replace view public.analytics_data_quality
with (security_invoker = true)
as
with vote_stats as (
  select
    campaign_id,
    (created_at at time zone 'Asia/Seoul')::date as measured_date,
    count(*)::bigint as vote_rows,
    count(*) filter (where session_id is not null)::bigint as votes_with_session,
    count(*) filter (where page_view_id is not null)::bigint as votes_with_page_view
  from public.votes
  group by campaign_id, (created_at at time zone 'Asia/Seoul')::date
),
event_stats as (
  select
    campaign_id,
    (received_at at time zone 'Asia/Seoul')::date as measured_date,
    count(*)::bigint as unique_events,
    count(*) filter (
      where event_name in ('vote_rate_limited', 'vote_request_failed')
    )::bigint as client_error_events,
    count(*) filter (where page_view_id is null)::bigint as events_without_page_view
  from public.analytics_events
  group by campaign_id, (received_at at time zone 'Asia/Seoul')::date
),
page_view_stats as (
  select
    campaign_id,
    (started_at at time zone 'Asia/Seoul')::date as measured_date,
    count(*)::bigint as page_views,
    count(*) filter (where last_heartbeat_at is null)::bigint
      as page_views_without_heartbeat
  from public.analytics_page_views
  where analytics_enabled
  group by campaign_id, (started_at at time zone 'Asia/Seoul')::date
),
lifetime_vote_stats as (
  select campaign_id, coalesce(sum(vote_rows), 0)::bigint as lifetime_vote_rows
  from vote_stats
  group by campaign_id
),
shard_stats as (
  select campaign_id, coalesce(sum(vote_count), 0)::bigint as shard_vote_count
  from public.vote_count_shards
  group by campaign_id
),
measured_days as (
  select campaign_id, measured_date from vote_stats
  union
  select campaign_id, measured_date from event_stats
  union
  select campaign_id, measured_date from page_view_stats
),
latest_measured_day as (
  select campaign_id, max(measured_date) as measured_date
  from measured_days
  group by campaign_id
)
select
  settings.campaign_id,
  measured_days.measured_date,
  coalesce(vote_stats.vote_rows, 0)::bigint as vote_rows,
  coalesce(vote_stats.votes_with_session, 0)::bigint as votes_with_session,
  coalesce(vote_stats.votes_with_page_view, 0)::bigint as votes_with_page_view,
  coalesce(event_stats.unique_events, 0)::bigint as unique_events,
  coalesce(event_stats.client_error_events, 0)::bigint as client_error_events,
  coalesce(event_stats.events_without_page_view, 0)::bigint as events_without_page_view,
  coalesce(page_view_stats.page_views, 0)::bigint as page_views,
  coalesce(page_view_stats.page_views_without_heartbeat, 0)::bigint
    as page_views_without_heartbeat,
  case
    when latest_measured_day.measured_date = measured_days.measured_date
      then shard_stats.shard_vote_count
  end as shard_vote_count,
  case
    when latest_measured_day.measured_date = measured_days.measured_date
      then coalesce(shard_stats.shard_vote_count, 0)
        = coalesce(lifetime_vote_stats.lifetime_vote_rows, 0)
  end as shard_count_matches,
  round(
    coalesce(vote_stats.votes_with_session, 0)::numeric
      / nullif(vote_stats.vote_rows, 0),
    4
  ) as vote_session_link_rate,
  round(
    coalesce(vote_stats.votes_with_page_view, 0)::numeric
      / nullif(vote_stats.vote_rows, 0),
    4
  ) as vote_page_view_link_rate,
  round(
    coalesce(event_stats.client_error_events, 0)::numeric
      / nullif(event_stats.unique_events, 0),
    4
  ) as client_error_event_rate,
  round(
    coalesce(page_view_stats.page_views_without_heartbeat, 0)::numeric
      / nullif(page_view_stats.page_views, 0),
    4
  ) as page_view_heartbeat_missing_rate
from public.campaign_settings as settings
join measured_days on measured_days.campaign_id = settings.campaign_id
left join vote_stats
  on vote_stats.campaign_id = measured_days.campaign_id
 and vote_stats.measured_date = measured_days.measured_date
left join event_stats
  on event_stats.campaign_id = measured_days.campaign_id
 and event_stats.measured_date = measured_days.measured_date
left join page_view_stats
  on page_view_stats.campaign_id = measured_days.campaign_id
 and page_view_stats.measured_date = measured_days.measured_date
left join lifetime_vote_stats
  on lifetime_vote_stats.campaign_id = settings.campaign_id
left join shard_stats
  on shard_stats.campaign_id = settings.campaign_id
left join latest_measured_day
  on latest_measured_day.campaign_id = settings.campaign_id
where settings.singleton;

do $verification$
begin
  if to_regclass('public.analytics_acquisition') is null then
    raise exception 'analytics_acquisition view is missing after rebuild';
  end if;
  if to_regclass('public.analytics_data_quality') is null then
    raise exception 'analytics_data_quality view is missing after rebuild';
  end if;

  if has_table_privilege('anon', 'public.analytics_acquisition', 'SELECT')
    or has_table_privilege('authenticated', 'public.analytics_acquisition', 'SELECT')
    or not has_table_privilege('service_role', 'public.analytics_acquisition', 'SELECT') then
    raise exception 'Unexpected privileges on public.analytics_acquisition';
  end if;
  if has_table_privilege('anon', 'public.analytics_data_quality', 'SELECT')
    or has_table_privilege('authenticated', 'public.analytics_data_quality', 'SELECT')
    or not has_table_privilege('service_role', 'public.analytics_data_quality', 'SELECT') then
    raise exception 'Unexpected privileges on public.analytics_data_quality';
  end if;
end
$verification$;

commit;

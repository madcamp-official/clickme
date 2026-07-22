begin;

-- The topic6 team-voting system (20260721000000) added team_votes and
-- team_share_links as fully parallel tables so the new feature could never
-- touch binary data. That meant the admin "개요"/"분석" pages' funnel,
-- acquisition, and engagement numbers silently went binary-only the moment
-- the site switched its live topic to team voting: "투표 완료 방문자" and
-- "공유 링크 생성" read as near-zero even with tens of thousands of real
-- team votes, because these views only ever looked at public.votes and
-- public.share_links. Recreate them to count both systems. Output columns
-- are unchanged -- only the underlying vote/share sources are widened.
--
-- Not touched here, on purpose:
-- - analytics_referral_funnel / analytics_cta_experiment: both are built
--   around the referral_share_id / initial_referral_share_id attribution
--   chain, which is FK'd specifically to share_links (see
--   20260716005000). Extending that to team shares needs new FK columns
--   and session-bootstrap wiring for team referral tokens -- a separate,
--   larger change than widening a read-only aggregate.
-- - analytics_data_quality: a vote/shard integrity health-check specific
--   to the binary counter system, not a business metric.
-- - analytics_retention: purely session-based already, no vote/choice
--   dependency, already accurate for both systems.

create or replace view public.analytics_daily_funnel
with (security_invoker = true)
as
with page_counts as (
  select session_id, count(*)::bigint as page_view_count
  from public.analytics_page_views
  where analytics_enabled
  group by session_id
),
combined_votes as (
  select votes.session_id, votes.page_view_id
  from public.votes as votes
  where votes.session_id is not null
  union all
  select team_votes.session_id, team_votes.page_view_id
  from public.team_votes as team_votes
  where team_votes.session_id is not null
),
vote_counts as (
  select combined_votes.session_id, count(*)::bigint as vote_count
  from combined_votes
  join public.analytics_page_views as page_views
    on page_views.id = combined_votes.page_view_id
   and page_views.analytics_enabled
  group by combined_votes.session_id
),
combined_shares as (
  select session_id from public.share_links
  union all
  select session_id from public.team_share_links
),
share_counts as (
  select session_id, count(*)::bigint as share_count
  from combined_shares
  group by session_id
)
select
  sessions.campaign_id,
  sessions.session_date,
  count(*)::bigint as visitors,
  count(*) filter (
    where (visitors.first_analytics_seen_at at time zone 'Asia/Seoul')::date
      = sessions.session_date
  )::bigint as new_visitors,
  count(*) filter (
    where (visitors.first_analytics_seen_at at time zone 'Asia/Seoul')::date
      < sessions.session_date
  )::bigint as returning_visitors,
  count(*)::bigint as sessions,
  coalesce(sum(page_counts.page_view_count), 0)::bigint as page_views,
  count(*) filter (
    where coalesce(page_counts.page_view_count, 0) > 1
  )::bigint as same_day_reentering_visitors,
  count(*) filter (where coalesce(vote_counts.vote_count, 0) > 0)::bigint
    as activated_visitors,
  coalesce(sum(vote_counts.vote_count), 0)::bigint as successful_votes,
  coalesce(sum(share_counts.share_count), 0)::bigint as share_links_created
from public.analytics_sessions as sessions
join public.analytics_visitors as visitors
  on visitors.campaign_id = sessions.campaign_id
 and visitors.visitor_hash = sessions.visitor_hash
left join page_counts on page_counts.session_id = sessions.id
left join vote_counts on vote_counts.session_id = sessions.id
left join share_counts on share_counts.session_id = sessions.id
where sessions.analytics_enabled
  and visitors.analytics_enabled
group by sessions.campaign_id, sessions.session_date;

create or replace view public.analytics_acquisition
with (security_invoker = true)
as
with session_votes as (
  select
    combined_votes.session_id,
    count(*)::bigint as vote_count
  from (
    select votes.session_id, votes.page_view_id
    from public.votes as votes
    where votes.session_id is not null
    union all
    select team_votes.session_id, team_votes.page_view_id
    from public.team_votes as team_votes
    where team_votes.session_id is not null
  ) as combined_votes
  join public.analytics_page_views as vote_page
    on vote_page.id = combined_votes.page_view_id
   and vote_page.analytics_enabled
  group by combined_votes.session_id
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

create or replace view public.analytics_engagement
with (security_invoker = true)
as
select
  sessions.campaign_id,
  sessions.session_date,
  count(*)::bigint as sessions,
  percentile_cont(0.5) within group (order by sessions.active_ms)::bigint
    as active_ms_p50,
  percentile_cont(0.75) within group (order by sessions.active_ms)::bigint
    as active_ms_p75,
  avg(page_views.max_scroll_percent)::numeric(7, 2) as average_max_scroll_percent,
  count(*) filter (
    where sessions.active_ms >= 10000
      or exists (
        select 1
        from public.votes as votes
        join public.analytics_page_views as vote_page
          on vote_page.id = votes.page_view_id
         and vote_page.analytics_enabled
        where votes.session_id = sessions.id
      )
      or exists (
        select 1
        from public.team_votes as team_votes
        join public.analytics_page_views as team_vote_page
          on team_vote_page.id = team_votes.page_view_id
         and team_vote_page.analytics_enabled
        where team_votes.session_id = sessions.id
      )
      or exists (select 1 from public.share_links where share_links.session_id = sessions.id)
      or exists (select 1 from public.team_share_links where team_share_links.session_id = sessions.id)
  )::bigint as engaged_sessions
from public.analytics_sessions as sessions
left join lateral (
  select max(views.max_scroll_percent)::smallint as max_scroll_percent
  from public.analytics_page_views as views
  where views.session_id = sessions.id
    and views.analytics_enabled
) as page_views on true
where sessions.analytics_enabled
group by sessions.campaign_id, sessions.session_date;

do $verification$
declare
  checked_view text;
begin
  foreach checked_view in array array[
    'public.analytics_daily_funnel',
    'public.analytics_acquisition',
    'public.analytics_engagement'
  ]
  loop
    if to_regclass(checked_view) is null then
      raise exception 'Expected view is missing: %', checked_view;
    end if;
  end loop;
end
$verification$;

commit;

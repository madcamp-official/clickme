begin;

-- comments (and the votes table submit_comment checks) aren't scoped to a
-- "topic era" -- campaign_settings is a hard singleton, so switching topics
-- only archives+resets vote_count_shards (see archive_current_topic_and_reset
-- in 20260718001000). Comments from a previous topic kept showing up under
-- the new one, and submit_comment's vote_required check could be satisfied
-- by a vote cast for a completely different topic that happened to reuse the
-- same 'dip'/'pour' enum value.
--
-- Scope both to topic_history.archived_at, the boundary already recorded by
-- every topic switch, instead of deleting any row: prior comments/votes stay
-- in the database for later inspection or manual cleanup, they're just
-- excluded from the current era's public list and vote_required check.

create or replace function public.list_public_comments(p_limit integer default 50)
returns table (
  id uuid,
  choice public.vote_choice,
  body text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
set statement_timeout = '2s'
as $$
  select
    comments.id,
    comments.choice,
    comments.body,
    comments.created_at
  from public.comments as comments
  join public.campaign_settings as current_campaign
    on current_campaign.campaign_id = comments.campaign_id
   and current_campaign.singleton
  where comments.created_at > coalesce(
    (select max(topics.archived_at) from public.topic_history as topics),
    '-infinity'::timestamptz
  )
  order by comments.created_at desc
  limit greatest(1, least(coalesce(p_limit, 50), 100));
$$;

create or replace function public.submit_comment(
  p_visitor_hash text,
  p_network_hash text,
  p_session_id uuid,
  p_page_view_id uuid,
  p_request_id uuid,
  p_choice public.vote_choice,
  p_body text
)
returns table (
  comment_id uuid,
  accepted boolean,
  duplicate boolean
)
language plpgsql
security definer
set search_path = ''
set statement_timeout = '3s'
as $$
declare
  request_time timestamptz := clock_timestamp();
  campaign public.campaign_settings%rowtype;
  current_session public.analytics_sessions%rowtype;
  existing_comment public.comments%rowtype;
  trimmed_body text := btrim(coalesce(p_body, ''));
  new_comment_id uuid := gen_random_uuid();
  topic_era_started_at timestamptz;
  v_attempt_id uuid;
  v_allowed boolean;
begin
  if p_visitor_hash !~ '^[0-9a-f]{64}$'
    or p_network_hash !~ '^[0-9a-f]{64}$'
    or p_request_id is null then
    raise exception 'invalid_comment_request' using errcode = '22023';
  end if;

  if char_length(trimmed_body) not between 1 and 240 then
    raise exception 'invalid_comment_body' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('comment-request:' || p_visitor_hash || ':' || p_request_id::text, 0)
  );

  select * into existing_comment
  from public.comments
  where visitor_hash = p_visitor_hash
    and request_id = p_request_id;

  if found then
    comment_id := existing_comment.id;
    accepted := true;
    duplicate := true;
    return next;
    return;
  end if;

  select * into strict campaign
  from public.campaign_settings
  where singleton
  for share;

  if campaign.mode <> 'active'
    or (campaign.starts_at is not null and request_time < campaign.starts_at)
    or (campaign.ends_at is not null and request_time >= campaign.ends_at) then
    raise exception 'campaign_not_active' using errcode = 'P0001';
  end if;

  select * into current_session
  from public.analytics_sessions
  where id = p_session_id
    and campaign_id = campaign.campaign_id
    and visitor_hash = p_visitor_hash;

  if not found or request_time >= current_session.expires_at
    or current_session.session_date <> (request_time at time zone 'Asia/Seoul')::date then
    raise exception 'session_expired' using errcode = 'P0001';
  end if;

  if not exists (
    select 1
    from public.analytics_page_views
    where id = p_page_view_id
      and session_id = p_session_id
      and visitor_hash = p_visitor_hash
  ) then
    raise exception 'invalid_page_view' using errcode = '22023';
  end if;

  select max(topics.archived_at) into topic_era_started_at
  from public.topic_history as topics;

  if not exists (
    select 1
    from public.votes
    where campaign_id = campaign.campaign_id
      and visitor_hash = p_visitor_hash
      and choice = p_choice
      and created_at > coalesce(topic_era_started_at, '-infinity'::timestamptz)
  ) then
    raise exception 'vote_required' using errcode = 'P0001';
  end if;

  select attempt.attempt_id, attempt.allowed
    into v_attempt_id, v_allowed
  from public.claim_comment_attempt(p_visitor_hash, p_network_hash) as attempt;

  if not v_allowed then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;

  insert into public.comments (
    id, campaign_id, session_id, page_view_id, request_id,
    visitor_hash, network_hash, choice, body, created_at
  ) values (
    new_comment_id, campaign.campaign_id, p_session_id, p_page_view_id, p_request_id,
    p_visitor_hash, p_network_hash, p_choice, trimmed_body, request_time
  );

  update public.comment_attempts
  set outcome = 'accepted'
  where id = v_attempt_id;

  comment_id := new_comment_id;
  accepted := true;
  duplicate := false;
  return next;
end;
$$;

revoke all on function public.list_public_comments(integer)
  from public, anon, authenticated;
grant execute on function public.list_public_comments(integer)
  to service_role;

revoke all on function public.submit_comment(
  text, text, uuid, uuid, uuid, public.vote_choice, text
) from public, anon, authenticated;
grant execute on function public.submit_comment(
  text, text, uuid, uuid, uuid, public.vote_choice, text
) to service_role;

do $verification$
declare
  checked_function text;
begin
  foreach checked_function in array array[
    'public.list_public_comments(integer)',
    'public.submit_comment(text,text,uuid,uuid,uuid,public.vote_choice,text)'
  ]
  loop
    if to_regprocedure(checked_function) is null then
      raise exception 'Required RPC is missing: %', checked_function;
    end if;

    if has_function_privilege('anon', checked_function, 'EXECUTE')
      or has_function_privilege('authenticated', checked_function, 'EXECUTE')
      or not has_function_privilege('service_role', checked_function, 'EXECUTE') then
      raise exception 'Unexpected RPC privileges: %', checked_function;
    end if;
  end loop;
end
$verification$;

commit;

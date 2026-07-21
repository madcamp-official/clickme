begin;

-- N-way (KBO team) voting, built as a fully separate schema alongside the
-- existing binary vote_choice/votes/vote_count_shards system rather than
-- extending it. campaign_settings stays a hard singleton either way; a topic
-- is either "binary" (existing tables) or "team" (these new ones), never
-- both live at once, matching the single-active-topic model already in use.
-- Not wired into any page yet -- these tables/RPCs have no caller until the
-- frontend cutover, so this migration has zero effect on the live topic.

create type public.team_choice as enum (
  'kia', 'samsung', 'lg', 'doosan', 'kt', 'ssg', 'lotte', 'hanwha', 'nc', 'kiwoom'
);

-- ---------------------------------------------------------------------------
-- Votes and constant-cost counters (mirrors votes / vote_count_shards)
-- ---------------------------------------------------------------------------

create table public.team_votes (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaign_settings (campaign_id),
  session_id uuid references public.analytics_sessions (id),
  page_view_id uuid references public.analytics_page_views (id),
  request_id uuid not null,
  visitor_hash text not null,
  network_hash text not null,
  choice public.team_choice not null,
  created_at timestamptz not null default now(),
  constraint team_votes_visitor_hash_format check (visitor_hash ~ '^[0-9a-f]{64}$'),
  constraint team_votes_network_hash_format check (network_hash ~ '^[0-9a-f]{64}$'),
  constraint team_votes_request_idempotency unique (visitor_hash, request_id)
);

create index team_votes_visitor_created_id_idx
  on public.team_votes (visitor_hash, created_at desc, id desc);
create index team_votes_session_idx
  on public.team_votes (session_id)
  where session_id is not null;
create index team_votes_campaign_choice_idx
  on public.team_votes (campaign_id, choice);

create table public.team_vote_shards (
  campaign_id uuid not null references public.campaign_settings (campaign_id),
  choice public.team_choice not null,
  shard_id smallint not null check (shard_id between 0 and 31),
  vote_count bigint not null default 0 check (vote_count >= 0),
  updated_at timestamptz not null default clock_timestamp(),
  primary key (campaign_id, choice, shard_id)
);

insert into public.team_vote_shards (campaign_id, choice, shard_id)
select settings.campaign_id, choices.choice, shards.shard_id
from public.campaign_settings as settings
cross join unnest(enum_range(null::public.team_choice)) as choices(choice)
cross join generate_series(0, 31) as shards(shard_id)
where settings.singleton;

alter table public.team_votes enable row level security;
alter table public.team_vote_shards enable row level security;
revoke all on table public.team_votes from anon, authenticated;
revoke all on table public.team_vote_shards from anon, authenticated;
grant select, insert on table public.team_votes to service_role;
grant select, insert, update on table public.team_vote_shards to service_role;

create policy team_votes_service_role_only on public.team_votes
  for all to service_role using (true) with check (true);
create policy team_vote_shards_service_role_only on public.team_vote_shards
  for all to service_role using (true) with check (true);

-- cast_team_vote mirrors cast_vote exactly (idempotency, campaign window,
-- session/page-view checks, one shard increment per vote) but reuses the
-- existing vote_rate_buckets table for the per-network 15/sec cap -- that
-- table has no choice/campaign column, so sharing it across binary and team
-- voting is just a shared network-abuse budget, not a behavior change for
-- either existing caller.
create function public.cast_team_vote(
  p_visitor_hash text,
  p_network_hash text,
  p_session_id uuid,
  p_page_view_id uuid,
  p_request_id uuid,
  p_choice public.team_choice
)
returns table (
  vote_id uuid,
  accepted boolean,
  duplicate boolean,
  choice public.team_choice
)
language plpgsql
security definer
set search_path = ''
set statement_timeout = '3s'
as $$
declare
  vote_time timestamptz := clock_timestamp();
  campaign public.campaign_settings%rowtype;
  current_session public.analytics_sessions%rowtype;
  existing_vote public.team_votes%rowtype;
  rate_window timestamptz := date_trunc('second', vote_time);
  accepted_vote_count smallint;
  new_vote_id uuid := gen_random_uuid();
  counter_shard smallint;
begin
  if p_visitor_hash !~ '^[0-9a-f]{64}$'
    or p_network_hash !~ '^[0-9a-f]{64}$'
    or p_request_id is null then
    raise exception 'invalid_vote_request' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('team-vote-request:' || p_visitor_hash || ':' || p_request_id::text, 0)
  );

  select * into existing_vote
  from public.team_votes
  where visitor_hash = p_visitor_hash
    and request_id = p_request_id;

  if found then
    vote_id := existing_vote.id;
    accepted := true;
    duplicate := true;
    choice := existing_vote.choice;
    return next;
    return;
  end if;

  select * into strict campaign
  from public.campaign_settings
  where singleton
  for share;

  if campaign.mode = 'read_only'
    or (campaign.starts_at is not null and vote_time < campaign.starts_at)
    or (campaign.ends_at is not null and vote_time >= campaign.ends_at) then
    raise exception 'campaign_not_active' using errcode = 'P0001';
  end if;

  select * into current_session
  from public.analytics_sessions
  where id = p_session_id
    and campaign_id = campaign.campaign_id
    and visitor_hash = p_visitor_hash;

  if not found or vote_time >= current_session.expires_at
    or current_session.session_date <> (vote_time at time zone 'Asia/Seoul')::date then
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

  insert into public.vote_rate_buckets as bucket (
    network_hash,
    window_started_at,
    vote_count,
    updated_at
  ) values (
    p_network_hash,
    rate_window,
    1,
    vote_time
  )
  on conflict (network_hash, window_started_at) do update
    set vote_count = bucket.vote_count + 1,
        updated_at = excluded.updated_at
    where bucket.vote_count < 15
  returning bucket.vote_count into accepted_vote_count;

  if not found then
    raise exception 'network_vote_rate_limited' using errcode = 'P0001';
  end if;

  insert into public.team_votes (
    id, campaign_id, session_id, page_view_id, request_id,
    visitor_hash, network_hash, choice, created_at
  ) values (
    new_vote_id, campaign.campaign_id, p_session_id, p_page_view_id, p_request_id,
    p_visitor_hash, p_network_hash, p_choice, vote_time
  );

  counter_shard := mod(
    hashtextextended(new_vote_id::text, 0) & 9223372036854775807,
    32
  )::smallint;

  update public.team_vote_shards as shards
  set vote_count = shards.vote_count + 1,
      updated_at = vote_time
  where shards.campaign_id = campaign.campaign_id
    and shards.choice = p_choice
    and shards.shard_id = counter_shard;

  if not found then
    raise exception 'team_vote_counter_shard_missing' using errcode = 'P0001';
  end if;

  update public.analytics_sessions
  set last_activity_at = vote_time,
      updated_at = vote_time
  where id = p_session_id;

  vote_id := new_vote_id;
  accepted := true;
  duplicate := false;
  choice := p_choice;
  return next;
end;
$$;

create function public.get_public_team_vote_results()
returns table (
  choice public.team_choice,
  vote_count bigint,
  campaign_id uuid,
  campaign_status public.campaign_mode,
  starts_at timestamptz,
  ends_at timestamptz,
  revision bigint
)
language sql
stable
security definer
set search_path = ''
set statement_timeout = '2s'
as $$
  select
    shards.choice,
    coalesce(sum(shards.vote_count), 0)::bigint,
    settings.campaign_id,
    case
      when (settings.starts_at is not null and statement_timestamp() < settings.starts_at)
        or (settings.ends_at is not null and statement_timestamp() >= settings.ends_at)
      then 'read_only'::public.campaign_mode
      else settings.mode
    end,
    settings.starts_at,
    settings.ends_at,
    settings.revision
  from public.campaign_settings as settings
  join public.team_vote_shards as shards
    on shards.campaign_id = settings.campaign_id
  where settings.singleton
  group by shards.choice, settings.campaign_id, settings.mode, settings.starts_at, settings.ends_at, settings.revision
  order by shards.choice;
$$;

revoke all on function public.cast_team_vote(
  text, text, uuid, uuid, uuid, public.team_choice
) from public, anon, authenticated;
grant execute on function public.cast_team_vote(
  text, text, uuid, uuid, uuid, public.team_choice
) to service_role;

revoke all on function public.get_public_team_vote_results()
  from public, anon, authenticated;
grant execute on function public.get_public_team_vote_results()
  to service_role;

-- ---------------------------------------------------------------------------
-- Topic archive tables (mirrors topic_history, but one row per team instead
-- of a fixed option_a/option_b pair). Created before the comments section
-- below since list_public_team_comments (a `language sql` function) is
-- validated against real objects at creation time and references
-- team_topic_history for era scoping.
-- ---------------------------------------------------------------------------

create table public.team_topic_history (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaign_settings (campaign_id),
  title text not null,
  starts_at timestamptz,
  ends_at timestamptz,
  archived_at timestamptz not null default clock_timestamp(),
  reason text not null,
  constraint team_topic_history_title_length check (char_length(title) between 1 and 200),
  constraint team_topic_history_reason_length check (char_length(reason) between 1 and 500)
);

create table public.team_topic_history_results (
  team_topic_history_id uuid not null references public.team_topic_history (id) on delete cascade,
  choice public.team_choice not null,
  label text not null,
  vote_count bigint not null default 0 check (vote_count >= 0),
  primary key (team_topic_history_id, choice),
  constraint team_topic_history_results_label_length check (char_length(label) between 1 and 60)
);

create index team_topic_history_archived_at_idx
  on public.team_topic_history (archived_at desc);

alter table public.team_topic_history enable row level security;
alter table public.team_topic_history_results enable row level security;
revoke all on table public.team_topic_history from anon, authenticated;
revoke all on table public.team_topic_history_results from anon, authenticated;
grant select, insert on table public.team_topic_history to service_role;
grant select, insert on table public.team_topic_history_results to service_role;

create policy team_topic_history_service_role_only on public.team_topic_history
  for all to service_role using (true) with check (true);
create policy team_topic_history_results_service_role_only on public.team_topic_history_results
  for all to service_role using (true) with check (true);

-- ---------------------------------------------------------------------------
-- Comments (mirrors the campaign-scoped comments table/RPCs). Reuses
-- claim_comment_attempt as-is for rate limiting -- it only takes a visitor
-- and network hash, so it has no notion of "binary" vs "team" comments and
-- needs no change.
-- ---------------------------------------------------------------------------

create table public.team_comments (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaign_settings (campaign_id),
  session_id uuid,
  page_view_id uuid,
  request_id uuid not null,
  visitor_hash text not null,
  network_hash text not null,
  choice public.team_choice not null,
  body text not null,
  created_at timestamptz not null default now(),
  constraint team_comments_visitor_hash_format check (visitor_hash ~ '^[0-9a-f]{64}$'),
  constraint team_comments_network_hash_format check (network_hash ~ '^[0-9a-f]{64}$'),
  constraint team_comments_body_length check (char_length(body) between 1 and 240),
  constraint team_comments_request_idempotency unique (visitor_hash, request_id)
);

create index team_comments_campaign_created_idx
  on public.team_comments (campaign_id, created_at desc);

alter table public.team_comments enable row level security;
revoke all on table public.team_comments from anon, authenticated;
grant select, insert, delete on table public.team_comments to service_role;

create policy team_comments_service_role_only on public.team_comments
  for all to service_role using (true) with check (true);

create function public.submit_team_comment(
  p_visitor_hash text,
  p_network_hash text,
  p_session_id uuid,
  p_page_view_id uuid,
  p_request_id uuid,
  p_choice public.team_choice,
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
  existing_comment public.team_comments%rowtype;
  trimmed_body text := btrim(coalesce(p_body, ''));
  new_comment_id uuid := gen_random_uuid();
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
    hashtextextended('team-comment-request:' || p_visitor_hash || ':' || p_request_id::text, 0)
  );

  select * into existing_comment
  from public.team_comments
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

  if not exists (
    select 1
    from public.team_votes
    where campaign_id = campaign.campaign_id
      and visitor_hash = p_visitor_hash
      and choice = p_choice
  ) then
    raise exception 'vote_required' using errcode = 'P0001';
  end if;

  select attempt.attempt_id, attempt.allowed
    into v_attempt_id, v_allowed
  from public.claim_comment_attempt(p_visitor_hash, p_network_hash) as attempt;

  if not v_allowed then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;

  insert into public.team_comments (
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

revoke all on function public.submit_team_comment(
  text, text, uuid, uuid, uuid, public.team_choice, text
) from public, anon, authenticated;
grant execute on function public.submit_team_comment(
  text, text, uuid, uuid, uuid, public.team_choice, text
) to service_role;

-- Scoped to the current "team topic era" the same way list_public_comments
-- is scoped to the binary topic era: only rows created after the most
-- recent team_topic_history archive boundary are shown.
create function public.list_public_team_comments(p_limit integer default 50)
returns table (
  id uuid,
  choice public.team_choice,
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
  from public.team_comments as comments
  join public.campaign_settings as current_campaign
    on current_campaign.campaign_id = comments.campaign_id
   and current_campaign.singleton
  where comments.created_at > coalesce(
    (select max(topics.archived_at) from public.team_topic_history as topics),
    '-infinity'::timestamptz
  )
  order by comments.created_at desc
  limit greatest(1, least(coalesce(p_limit, 50), 100));
$$;

revoke all on function public.list_public_team_comments(integer)
  from public, anon, authenticated;
grant execute on function public.list_public_team_comments(integer)
  to service_role;

-- ---------------------------------------------------------------------------
-- Topic archive RPCs (tables created earlier, above the comments section).
-- ---------------------------------------------------------------------------

create function public.archive_current_team_topic_and_reset(
  p_title text,
  p_reason text,
  p_labels jsonb
)
returns table (
  id uuid,
  campaign_id uuid,
  title text,
  starts_at timestamptz,
  ends_at timestamptz,
  archived_at timestamptz,
  reason text
)
language plpgsql
security definer
set search_path = ''
set statement_timeout = '3s'
as $$
declare
  campaign public.campaign_settings%rowtype;
  new_id uuid := gen_random_uuid();
  archived_time timestamptz := clock_timestamp();
  team_row record;
  team_label text;
begin
  if char_length(btrim(coalesce(p_title, ''))) not between 1 and 200
    or char_length(btrim(coalesce(p_reason, ''))) not between 1 and 500 then
    raise exception 'invalid_team_topic_archive_request' using errcode = '22023';
  end if;

  if p_labels is null or jsonb_typeof(p_labels) <> 'object' then
    raise exception 'invalid_team_topic_labels' using errcode = '22023';
  end if;

  select * into strict campaign
  from public.campaign_settings
  where singleton
  for update;

  insert into public.team_topic_history (id, campaign_id, title, starts_at, ends_at, archived_at, reason)
  values (new_id, campaign.campaign_id, btrim(p_title), campaign.starts_at, campaign.ends_at, archived_time, btrim(p_reason));

  for team_row in
    select
      shards.choice,
      coalesce(sum(shards.vote_count), 0)::bigint as vote_count
    from public.team_vote_shards as shards
    where shards.campaign_id = campaign.campaign_id
    group by shards.choice
  loop
    team_label := p_labels ->> team_row.choice::text;
    if team_label is null or char_length(btrim(team_label)) not between 1 and 60 then
      raise exception 'invalid_team_topic_labels' using errcode = '22023';
    end if;

    insert into public.team_topic_history_results (team_topic_history_id, choice, label, vote_count)
    values (new_id, team_row.choice, btrim(team_label), team_row.vote_count);
  end loop;

  update public.team_vote_shards as shards
  set vote_count = 0,
      updated_at = archived_time
  where shards.campaign_id = campaign.campaign_id;

  id := new_id;
  campaign_id := campaign.campaign_id;
  title := btrim(p_title);
  starts_at := campaign.starts_at;
  ends_at := campaign.ends_at;
  archived_at := archived_time;
  reason := btrim(p_reason);
  return next;
end;
$$;

revoke all on function public.archive_current_team_topic_and_reset(text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.archive_current_team_topic_and_reset(text, text, jsonb)
  to service_role;

create function public.list_public_team_topic_history(p_limit integer default 10)
returns table (
  id uuid,
  title text,
  archived_at timestamptz,
  results jsonb
)
language sql
stable
security definer
set search_path = ''
set statement_timeout = '2s'
as $$
  select
    topics.id,
    topics.title,
    topics.archived_at,
    coalesce(
      jsonb_agg(
        jsonb_build_object('choice', results.choice, 'label', results.label, 'voteCount', results.vote_count)
        order by results.vote_count desc
      ) filter (where results.team_topic_history_id is not null),
      '[]'::jsonb
    )
  from public.team_topic_history as topics
  left join public.team_topic_history_results as results
    on results.team_topic_history_id = topics.id
  group by topics.id, topics.title, topics.archived_at
  order by topics.archived_at desc
  limit greatest(1, least(coalesce(p_limit, 10), 50));
$$;

revoke all on function public.list_public_team_topic_history(integer)
  from public, anon, authenticated;
grant execute on function public.list_public_team_topic_history(integer)
  to service_role;

do $verification$
declare
  checked_table text;
  checked_function text;
begin
  foreach checked_table in array array[
    'team_votes', 'team_vote_shards', 'team_comments',
    'team_topic_history', 'team_topic_history_results'
  ]
  loop
    if not exists (
      select 1
      from pg_catalog.pg_class as classes
      join pg_catalog.pg_namespace as namespaces
        on namespaces.oid = classes.relnamespace
      where namespaces.nspname = 'public'
        and classes.relname = checked_table
        and classes.relrowsecurity
    ) then
      raise exception 'RLS is not enabled on public.%', checked_table;
    end if;

    if has_table_privilege('anon', format('public.%I', checked_table), 'SELECT')
      or has_table_privilege('anon', format('public.%I', checked_table), 'INSERT')
      or has_table_privilege('authenticated', format('public.%I', checked_table), 'SELECT')
      or has_table_privilege('authenticated', format('public.%I', checked_table), 'INSERT') then
      raise exception 'Non-service role can access public.%', checked_table;
    end if;
  end loop;

  foreach checked_function in array array[
    'public.cast_team_vote(text,text,uuid,uuid,uuid,public.team_choice)',
    'public.get_public_team_vote_results()',
    'public.submit_team_comment(text,text,uuid,uuid,uuid,public.team_choice,text)',
    'public.list_public_team_comments(integer)',
    'public.archive_current_team_topic_and_reset(text,text,jsonb)',
    'public.list_public_team_topic_history(integer)'
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

  if (
    select count(*) from public.team_vote_shards
    where campaign_id = (select campaign_id from public.campaign_settings where singleton)
  ) <> 320 then
    raise exception 'Expected exactly 320 team vote counter shards (10 teams x 32)';
  end if;
end
$verification$;

commit;

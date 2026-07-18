begin;

-- ---------------------------------------------------------------------------
-- Campaign control
-- ---------------------------------------------------------------------------

create type public.campaign_mode as enum ('active', 'protected', 'read_only');

create table public.campaign_settings (
  campaign_id uuid primary key default gen_random_uuid(),
  singleton boolean not null default true unique check (singleton),
  starts_at timestamptz,
  ends_at timestamptz,
  mode public.campaign_mode not null default 'active',
  revision bigint not null default 1 check (revision > 0),
  updated_at timestamptz not null default clock_timestamp(),
  constraint campaign_settings_window_order check (
    starts_at is null or ends_at is null or starts_at < ends_at
  )
);

create table public.campaign_settings_history (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaign_settings (campaign_id),
  previous_starts_at timestamptz,
  previous_ends_at timestamptz,
  previous_mode public.campaign_mode not null,
  new_starts_at timestamptz,
  new_ends_at timestamptz,
  new_mode public.campaign_mode not null,
  previous_revision bigint not null,
  new_revision bigint not null,
  reason text not null,
  changed_by text not null,
  changed_at timestamptz not null default clock_timestamp(),
  constraint campaign_settings_history_reason_length
    check (char_length(reason) between 1 and 500),
  constraint campaign_settings_history_actor_length
    check (char_length(changed_by) between 1 and 128),
  constraint campaign_settings_history_revision_order
    check (new_revision = previous_revision + 1)
);

insert into public.campaign_settings (
  campaign_id,
  starts_at,
  ends_at,
  mode
) values (
  '00000000-0000-4000-8000-000000000001',
  null,
  null,
  'active'
);

-- ---------------------------------------------------------------------------
-- First-party analytics and referrals. All identifying values are server-side
-- HMACs; the schema has no columns for raw IP addresses or full user agents.
-- ---------------------------------------------------------------------------

create type public.analytics_event_name as enum (
  'section_impression',
  'share_card_impression',
  'share_cta_clicked',
  'share_sheet_resolved',
  'share_sheet_cancelled',
  'share_link_copied',
  'share_image_downloaded',
  'referral_banner_impression',
  'rapid_click_lock_shown',
  'rapid_click_lock_confirmed',
  'vote_rate_limited',
  'vote_request_failed'
);

create table public.analytics_visitors (
  campaign_id uuid not null references public.campaign_settings (campaign_id),
  visitor_hash text not null,
  first_seen_at timestamptz not null default clock_timestamp(),
  last_seen_at timestamptz not null default clock_timestamp(),
  first_referrer_host text,
  first_utm_source text,
  initial_referral_share_id uuid,
  experiment_variant text not null,
  analytics_enabled boolean not null default false,
  first_analytics_seen_at timestamptz,
  primary key (campaign_id, visitor_hash),
  constraint analytics_visitors_hash_format
    check (visitor_hash ~ '^[0-9a-f]{64}$'),
  constraint analytics_visitors_experiment_variant
    check (experiment_variant in ('A', 'B')),
  constraint analytics_visitors_referrer_length
    check (first_referrer_host is null or char_length(first_referrer_host) <= 253),
  constraint analytics_visitors_utm_source_length
    check (first_utm_source is null or char_length(first_utm_source) <= 100),
  constraint analytics_visitors_enabled_timestamp check (
    not analytics_enabled or first_analytics_seen_at is not null
  )
);

create table public.analytics_sessions (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaign_settings (campaign_id),
  visitor_hash text not null,
  network_hash text not null,
  session_date date not null,
  started_at timestamptz not null default clock_timestamp(),
  last_activity_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null,
  referrer_host text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  utm_term text,
  country_code text,
  browser_family text,
  os_family text,
  device_type text,
  language text,
  client_timezone text,
  referral_share_id uuid,
  self_referral boolean not null default false,
  analytics_enabled boolean not null default false,
  visible_ms bigint not null default 0 check (visible_ms >= 0),
  active_ms bigint not null default 0 check (active_ms >= 0),
  last_accounted_at timestamptz not null default clock_timestamp(),
  last_active_accounted_at timestamptz not null default clock_timestamp(),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint analytics_sessions_visitor_hash_format
    check (visitor_hash ~ '^[0-9a-f]{64}$'),
  constraint analytics_sessions_network_hash_format
    check (network_hash ~ '^[0-9a-f]{64}$'),
  constraint analytics_sessions_one_per_kst_day
    unique (campaign_id, visitor_hash, session_date),
  constraint analytics_sessions_visitor_fk
    foreign key (campaign_id, visitor_hash)
    references public.analytics_visitors (campaign_id, visitor_hash),
  constraint analytics_sessions_expiry_after_start
    check (expires_at > started_at),
  constraint analytics_sessions_referrer_length
    check (referrer_host is null or char_length(referrer_host) <= 253),
  constraint analytics_sessions_utm_lengths check (
    (utm_source is null or char_length(utm_source) <= 100)
    and (utm_medium is null or char_length(utm_medium) <= 100)
    and (utm_campaign is null or char_length(utm_campaign) <= 100)
    and (utm_content is null or char_length(utm_content) <= 100)
    and (utm_term is null or char_length(utm_term) <= 100)
  ),
  constraint analytics_sessions_country_code_format
    check (country_code is null or country_code ~ '^[A-Z]{2}$'),
  constraint analytics_sessions_client_classification_lengths check (
    (browser_family is null or char_length(browser_family) <= 50)
    and (os_family is null or char_length(os_family) <= 50)
    and (device_type is null or char_length(device_type) <= 32)
    and (language is null or char_length(language) <= 35)
    and (client_timezone is null or char_length(client_timezone) <= 64)
  )
);

create table public.analytics_page_views (
  id uuid primary key,
  campaign_id uuid not null references public.campaign_settings (campaign_id),
  session_id uuid not null references public.analytics_sessions (id) on delete cascade,
  visitor_hash text not null,
  landing_path text not null,
  started_at timestamptz not null default clock_timestamp(),
  ended_at timestamptz,
  visible_ms bigint not null default 0 check (visible_ms >= 0),
  active_ms bigint not null default 0 check (active_ms >= 0),
  client_visible_ms bigint not null default 0 check (client_visible_ms >= 0),
  client_active_ms bigint not null default 0 check (client_active_ms >= 0),
  max_scroll_percent smallint not null default 0
    check (max_scroll_percent between 0 and 100),
  heartbeat_sequence bigint not null default 0 check (heartbeat_sequence >= 0),
  last_heartbeat_at timestamptz,
  viewport_width integer,
  viewport_height integer,
  screen_width integer,
  screen_height integer,
  touch_capable boolean,
  reduced_motion boolean,
  referral_share_id uuid,
  self_referral boolean not null default false,
  analytics_enabled boolean not null default false,
  created_at timestamptz not null default clock_timestamp(),
  constraint analytics_page_views_visitor_hash_format
    check (visitor_hash ~ '^[0-9a-f]{64}$'),
  constraint analytics_page_views_path_length
    check (
      char_length(landing_path) between 1 and 500
      and position('?' in landing_path) = 0
      and position('#' in landing_path) = 0
    ),
  constraint analytics_page_views_dimensions check (
    (viewport_width is null or viewport_width between 1 and 10000)
    and (viewport_height is null or viewport_height between 1 and 10000)
    and (screen_width is null or screen_width between 1 and 20000)
    and (screen_height is null or screen_height between 1 and 20000)
  )
);

create table public.share_links (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaign_settings (campaign_id),
  creator_visitor_hash text not null,
  session_id uuid not null references public.analytics_sessions (id),
  page_view_id uuid not null references public.analytics_page_views (id),
  idempotency_key uuid not null,
  token_hash text not null unique,
  choice public.vote_choice not null,
  dip_count bigint not null check (dip_count >= 0),
  pour_count bigint not null check (pour_count >= 0),
  parent_share_id uuid references public.share_links (id),
  image_path text,
  created_at timestamptz not null default clock_timestamp(),
  constraint share_links_creator_hash_format
    check (creator_visitor_hash ~ '^[0-9a-f]{64}$'),
  constraint share_links_token_hash_format
    check (token_hash ~ '^[0-9a-f]{64}$'),
  constraint share_links_idempotency
    unique (campaign_id, creator_visitor_hash, idempotency_key),
  constraint share_links_image_path_format check (
    image_path is null
    or (
      image_path ~ '^[0-9a-fA-F-]{36}\\.png$'
      and char_length(image_path) <= 64
    )
  )
);

alter table public.analytics_visitors
  add constraint analytics_visitors_initial_referral_fk
  foreign key (initial_referral_share_id)
  references public.share_links (id);

alter table public.analytics_sessions
  add constraint analytics_sessions_referral_fk
  foreign key (referral_share_id)
  references public.share_links (id);

alter table public.analytics_page_views
  add constraint analytics_page_views_referral_fk
  foreign key (referral_share_id)
  references public.share_links (id);

create table public.analytics_events (
  id uuid primary key,
  campaign_id uuid not null references public.campaign_settings (campaign_id),
  session_id uuid not null references public.analytics_sessions (id) on delete cascade,
  page_view_id uuid references public.analytics_page_views (id) on delete cascade,
  visitor_hash text not null,
  event_name public.analytics_event_name not null,
  occurred_at timestamptz not null,
  received_at timestamptz not null default clock_timestamp(),
  properties jsonb not null default '{}'::jsonb,
  constraint analytics_events_visitor_hash_format
    check (visitor_hash ~ '^[0-9a-f]{64}$'),
  constraint analytics_events_properties_object
    check (jsonb_typeof(properties) = 'object'),
  constraint analytics_events_properties_size
    check (octet_length(properties::text) <= 2048)
);

-- Small fixed-window counters are operational state, not analytics source
-- data. They prevent a bypass of the reverse-proxy limits from amplifying DB
-- writes. cleanup_operational_data removes expired rows.
create table public.analytics_rate_buckets (
  rate_kind text not null,
  subject_key text not null,
  window_started_at timestamptz not null,
  request_count smallint not null default 1,
  updated_at timestamptz not null default clock_timestamp(),
  primary key (rate_kind, subject_key, window_started_at),
  constraint analytics_rate_buckets_kind check (
    rate_kind in ('session_network', 'session_visitor', 'heartbeat', 'events')
  ),
  constraint analytics_rate_buckets_subject_length
    check (char_length(subject_key) between 1 and 64),
  constraint analytics_rate_buckets_count_range
    check (request_count between 1 and 300)
);

create index analytics_sessions_date_idx
  on public.analytics_sessions (campaign_id, session_date);
create index analytics_sessions_enabled_date_idx
  on public.analytics_sessions (campaign_id, session_date, visitor_hash)
  where analytics_enabled;
create index analytics_sessions_referral_idx
  on public.analytics_sessions (referral_share_id)
  where referral_share_id is not null;
create index analytics_page_views_session_idx
  on public.analytics_page_views (session_id, started_at);
create index analytics_page_views_referral_enabled_idx
  on public.analytics_page_views (referral_share_id, started_at)
  where analytics_enabled and referral_share_id is not null;
create index analytics_events_session_received_idx
  on public.analytics_events (session_id, received_at);
create index analytics_events_name_received_idx
  on public.analytics_events (event_name, received_at);
create index analytics_events_campaign_name_occurred_idx
  on public.analytics_events (campaign_id, event_name, occurred_at);
create index analytics_rate_buckets_expiry_idx
  on public.analytics_rate_buckets (window_started_at);
create index share_links_creator_created_idx
  on public.share_links (creator_visitor_hash, created_at desc);

-- ---------------------------------------------------------------------------
-- Idempotent votes and constant-cost counters
-- ---------------------------------------------------------------------------

alter table public.votes
  add column campaign_id uuid,
  add column session_id uuid,
  add column page_view_id uuid,
  add column request_id uuid;

update public.votes
set campaign_id = '00000000-0000-4000-8000-000000000001',
    request_id = id
where campaign_id is null or request_id is null;

alter table public.votes
  alter column campaign_id set not null,
  alter column request_id set not null,
  add constraint votes_campaign_fk
    foreign key (campaign_id) references public.campaign_settings (campaign_id),
  add constraint votes_session_fk
    foreign key (session_id) references public.analytics_sessions (id),
  add constraint votes_page_view_fk
    foreign key (page_view_id) references public.analytics_page_views (id),
  add constraint votes_request_idempotency unique (visitor_hash, request_id);

create index votes_visitor_created_id_idx
  on public.votes (visitor_hash, created_at desc, id desc);
create index votes_session_idx
  on public.votes (session_id)
  where session_id is not null;

create table public.vote_count_shards (
  campaign_id uuid not null references public.campaign_settings (campaign_id),
  choice public.vote_choice not null,
  shard_id smallint not null check (shard_id between 0 and 31),
  vote_count bigint not null default 0 check (vote_count >= 0),
  updated_at timestamptz not null default clock_timestamp(),
  primary key (campaign_id, choice, shard_id)
);

insert into public.vote_count_shards (campaign_id, choice, shard_id)
select settings.campaign_id, choices.choice, shards.shard_id
from public.campaign_settings as settings
cross join unnest(enum_range(null::public.vote_choice)) as choices(choice)
cross join generate_series(0, 31) as shards(shard_id);

with backfill as (
  select
    votes.campaign_id,
    votes.choice,
    mod(
      hashtextextended(votes.id::text, 0) & 9223372036854775807,
      32
    )::smallint as shard_id,
    count(*)::bigint as vote_count
  from public.votes as votes
  group by votes.campaign_id, votes.choice, shard_id
)
update public.vote_count_shards as shards
set vote_count = backfill.vote_count,
    updated_at = clock_timestamp()
from backfill
where shards.campaign_id = backfill.campaign_id
  and shards.choice = backfill.choice
  and shards.shard_id = backfill.shard_id;

-- ---------------------------------------------------------------------------
-- Private RPCs. Supabase is only called by the server with service_role.
-- ---------------------------------------------------------------------------

create function public.set_campaign_window(
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_mode public.campaign_mode,
  p_reason text
)
returns table (
  campaign_id uuid,
  starts_at timestamptz,
  ends_at timestamptz,
  mode public.campaign_mode,
  revision bigint,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
set statement_timeout = '3s'
as $$
declare
  previous public.campaign_settings%rowtype;
  changed_actor text;
begin
  if p_starts_at is not null and p_ends_at is not null
    and p_starts_at >= p_ends_at then
    raise exception 'invalid_campaign_window' using errcode = '22023';
  end if;

  if p_reason is null or char_length(btrim(p_reason)) not between 1 and 500 then
    raise exception 'invalid_campaign_change_reason' using errcode = '22023';
  end if;

  select * into strict previous
  from public.campaign_settings
  where singleton
  for update;

  changed_actor := coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    nullif(current_setting('request.jwt.claim.role', true), ''),
    session_user::text
  );

  insert into public.campaign_settings_history (
    campaign_id,
    previous_starts_at,
    previous_ends_at,
    previous_mode,
    new_starts_at,
    new_ends_at,
    new_mode,
    previous_revision,
    new_revision,
    reason,
    changed_by
  ) values (
    previous.campaign_id,
    previous.starts_at,
    previous.ends_at,
    previous.mode,
    p_starts_at,
    p_ends_at,
    p_mode,
    previous.revision,
    previous.revision + 1,
    btrim(p_reason),
    changed_actor
  );

  update public.campaign_settings as settings
  set starts_at = p_starts_at,
      ends_at = p_ends_at,
      mode = p_mode,
      revision = previous.revision + 1,
      updated_at = clock_timestamp()
  where settings.campaign_id = previous.campaign_id;

  return query
    select
      settings.campaign_id,
      settings.starts_at,
      settings.ends_at,
      settings.mode,
      settings.revision,
      settings.updated_at
    from public.campaign_settings as settings
    where settings.singleton;
end;
$$;

create function public.get_campaign_status()
returns table (
  campaign_id uuid,
  campaign_status public.campaign_mode,
  starts_at timestamptz,
  ends_at timestamptz,
  revision bigint,
  is_within_window boolean,
  server_time timestamptz
)
language sql
stable
security definer
set search_path = ''
set statement_timeout = '2s'
as $$
  select
    settings.campaign_id,
    case
      when (settings.starts_at is not null and statement_timestamp() < settings.starts_at)
        or (settings.ends_at is not null and statement_timestamp() >= settings.ends_at)
      then 'read_only'::public.campaign_mode
      else settings.mode
    end,
    settings.starts_at,
    settings.ends_at,
    settings.revision,
    (settings.starts_at is null or statement_timestamp() >= settings.starts_at)
      and (settings.ends_at is null or statement_timestamp() < settings.ends_at),
    statement_timestamp()
  from public.campaign_settings as settings
  where settings.singleton;
$$;

create function public.bootstrap_daily_session(
  p_visitor_hash text,
  p_network_hash text,
  p_page_view_id uuid,
  p_landing_path text,
  p_referrer_host text default null,
  p_utm_source text default null,
  p_utm_medium text default null,
  p_utm_campaign text default null,
  p_utm_content text default null,
  p_utm_term text default null,
  p_country_code text default null,
  p_browser_family text default null,
  p_os_family text default null,
  p_device_type text default null,
  p_language text default null,
  p_timezone text default null,
  p_viewport_width integer default null,
  p_viewport_height integer default null,
  p_screen_width integer default null,
  p_screen_height integer default null,
  p_touch boolean default null,
  p_reduced_motion boolean default null,
  p_referral_token_hash text default null
)
returns table (
  session_id uuid,
  page_view_id uuid,
  expires_at timestamptz,
  server_time timestamptz,
  campaign_id uuid,
  campaign_status public.campaign_mode,
  starts_at timestamptz,
  ends_at timestamptz,
  revision bigint,
  experiment_variant text
)
language plpgsql
security definer
set search_path = ''
set statement_timeout = '3s'
as $$
declare
  request_time timestamptz := clock_timestamp();
  current_date_kst date := (request_time at time zone 'Asia/Seoul')::date;
  next_midnight_kst timestamptz := (
    ((request_time at time zone 'Asia/Seoul')::date + 1)::timestamp
      at time zone 'Asia/Seoul'
  );
  campaign public.campaign_settings%rowtype;
  current_visitor public.analytics_visitors%rowtype;
  current_session public.analytics_sessions%rowtype;
  referral public.share_links%rowtype;
  variant text;
  referral_is_self boolean := false;
  accepted_rate_count smallint;
begin
  if p_visitor_hash !~ '^[0-9a-f]{64}$'
    or p_network_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid_anonymous_identity_hash' using errcode = '22023';
  end if;

  if p_page_view_id is null
    or p_landing_path is null
    or char_length(p_landing_path) not between 1 and 500
    or position('?' in p_landing_path) > 0
    or position('#' in p_landing_path) > 0 then
    raise exception 'invalid_page_view' using errcode = '22023';
  end if;

  if p_referral_token_hash is not null
    and p_referral_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid_referral_token_hash' using errcode = '22023';
  end if;

  select * into strict campaign
  from public.campaign_settings
  where singleton
  for share;

  if campaign.mode = 'read_only'
    or (campaign.starts_at is not null and request_time < campaign.starts_at)
    or (campaign.ends_at is not null and request_time >= campaign.ends_at) then
    raise exception 'campaign_not_active' using errcode = 'P0001';
  end if;

  -- The browser reuses p_page_view_id only when the same navigation's
  -- response is lost. Return the original bootstrap result before consuming
  -- rate quota or writing another page view.
  select sessions.* into current_session
  from public.analytics_page_views as page_views
  join public.analytics_sessions as sessions
    on sessions.id = page_views.session_id
  where page_views.id = p_page_view_id
    and page_views.campaign_id = campaign.campaign_id
    and page_views.visitor_hash = p_visitor_hash
    and sessions.visitor_hash = p_visitor_hash
    and sessions.session_date = current_date_kst
    and request_time < sessions.expires_at;

  if found then
    session_id := current_session.id;
    page_view_id := p_page_view_id;
    expires_at := current_session.expires_at;
    server_time := request_time;
    campaign_id := campaign.campaign_id;
    campaign_status := campaign.mode;
    starts_at := campaign.starts_at;
    ends_at := campaign.ends_at;
    revision := campaign.revision;
    experiment_variant := case
      when (hashtextextended(p_visitor_hash, 0) & 1) = 0 then 'A'
      else 'B'
    end;
    return next;
    return;
  end if;

  insert into public.analytics_rate_buckets as bucket (
    rate_kind,
    subject_key,
    window_started_at,
    request_count,
    updated_at
  ) values (
    'session_network',
    p_network_hash,
    date_trunc('minute', request_time),
    1,
    request_time
  )
  on conflict (rate_kind, subject_key, window_started_at) do update
    set request_count = bucket.request_count + 1,
        updated_at = excluded.updated_at
    where bucket.request_count < 300
  returning bucket.request_count into accepted_rate_count;

  if not found then
    raise exception 'session_rate_limited' using errcode = 'P0001';
  end if;

  insert into public.analytics_rate_buckets as bucket (
    rate_kind,
    subject_key,
    window_started_at,
    request_count,
    updated_at
  ) values (
    'session_visitor',
    p_visitor_hash,
    date_trunc('minute', request_time),
    1,
    request_time
  )
  on conflict (rate_kind, subject_key, window_started_at) do update
    set request_count = bucket.request_count + 1,
        updated_at = excluded.updated_at
    where bucket.request_count < 3
  returning bucket.request_count into accepted_rate_count;

  if not found then
    raise exception 'session_rate_limited' using errcode = 'P0001';
  end if;

  -- A protected campaign still creates the minimum daily session needed to
  -- authenticate votes; heartbeat/events/share RPCs remain disabled.
  variant := case
    when (hashtextextended(p_visitor_hash, 0) & 1) = 0 then 'A'
    else 'B'
  end;

  if campaign.mode = 'active' and p_referral_token_hash is not null then
    select * into referral
    from public.share_links as links
    where links.token_hash = p_referral_token_hash
      and links.campaign_id = campaign.campaign_id;

    if found then
      referral_is_self := referral.creator_visitor_hash = p_visitor_hash;
    end if;
  end if;

  insert into public.analytics_visitors as visitor (
    campaign_id,
    visitor_hash,
    first_seen_at,
    last_seen_at,
    first_referrer_host,
    first_utm_source,
    initial_referral_share_id,
    experiment_variant,
    analytics_enabled,
    first_analytics_seen_at
  ) values (
    campaign.campaign_id,
    p_visitor_hash,
    request_time,
    request_time,
    case when campaign.mode = 'active' then p_referrer_host end,
    case when campaign.mode = 'active' then p_utm_source end,
    case when referral.id is not null and not referral_is_self then referral.id end,
    variant,
    campaign.mode = 'active',
    case when campaign.mode = 'active' then request_time end
  )
  on conflict on constraint analytics_visitors_pkey do update
    set last_seen_at = excluded.last_seen_at,
        analytics_enabled = visitor.analytics_enabled or excluded.analytics_enabled,
        first_analytics_seen_at = coalesce(
          visitor.first_analytics_seen_at,
          excluded.first_analytics_seen_at
        ),
        first_referrer_host = case
          when not visitor.analytics_enabled and excluded.analytics_enabled
            then excluded.first_referrer_host
          else visitor.first_referrer_host
        end,
        first_utm_source = case
          when not visitor.analytics_enabled and excluded.analytics_enabled
            then excluded.first_utm_source
          else visitor.first_utm_source
        end,
        initial_referral_share_id = case
          when visitor.initial_referral_share_id is not null then
            visitor.initial_referral_share_id
          when excluded.initial_referral_share_id is null then null
          when exists (
            select 1
            from public.votes
            where votes.campaign_id = excluded.campaign_id
              and votes.visitor_hash = excluded.visitor_hash
          ) then null
          else excluded.initial_referral_share_id
        end
  returning * into current_visitor;

  insert into public.analytics_sessions as session (
    campaign_id,
    visitor_hash,
    network_hash,
    session_date,
    started_at,
    last_activity_at,
    expires_at,
    referrer_host,
    utm_source,
    utm_medium,
    utm_campaign,
    utm_content,
    utm_term,
    country_code,
    browser_family,
    os_family,
    device_type,
    language,
    client_timezone,
    referral_share_id,
    self_referral,
    analytics_enabled,
    last_accounted_at,
    last_active_accounted_at,
    created_at,
    updated_at
  ) values (
    campaign.campaign_id,
    p_visitor_hash,
    p_network_hash,
    current_date_kst,
    request_time,
    request_time,
    next_midnight_kst,
    case when campaign.mode = 'active' then p_referrer_host end,
    case when campaign.mode = 'active' then p_utm_source end,
    case when campaign.mode = 'active' then p_utm_medium end,
    case when campaign.mode = 'active' then p_utm_campaign end,
    case when campaign.mode = 'active' then p_utm_content end,
    case when campaign.mode = 'active' then p_utm_term end,
    case when campaign.mode = 'active' then p_country_code end,
    case when campaign.mode = 'active' then p_browser_family end,
    case when campaign.mode = 'active' then p_os_family end,
    case when campaign.mode = 'active' then p_device_type end,
    case when campaign.mode = 'active' then p_language end,
    case when campaign.mode = 'active' then p_timezone end,
    case when campaign.mode = 'active' then referral.id end,
    campaign.mode = 'active' and referral_is_self,
    campaign.mode = 'active',
    request_time,
    request_time,
    request_time,
    request_time
  )
  on conflict on constraint analytics_sessions_one_per_kst_day do update
    set last_activity_at = excluded.last_activity_at,
        analytics_enabled = session.analytics_enabled or excluded.analytics_enabled,
        referrer_host = case
          when not session.analytics_enabled and excluded.analytics_enabled
            then excluded.referrer_host else session.referrer_host end,
        utm_source = case
          when not session.analytics_enabled and excluded.analytics_enabled
            then excluded.utm_source else session.utm_source end,
        utm_medium = case
          when not session.analytics_enabled and excluded.analytics_enabled
            then excluded.utm_medium else session.utm_medium end,
        utm_campaign = case
          when not session.analytics_enabled and excluded.analytics_enabled
            then excluded.utm_campaign else session.utm_campaign end,
        utm_content = case
          when not session.analytics_enabled and excluded.analytics_enabled
            then excluded.utm_content else session.utm_content end,
        utm_term = case
          when not session.analytics_enabled and excluded.analytics_enabled
            then excluded.utm_term else session.utm_term end,
        country_code = case
          when not session.analytics_enabled and excluded.analytics_enabled
            then excluded.country_code else session.country_code end,
        browser_family = case
          when not session.analytics_enabled and excluded.analytics_enabled
            then excluded.browser_family else session.browser_family end,
        os_family = case
          when not session.analytics_enabled and excluded.analytics_enabled
            then excluded.os_family else session.os_family end,
        device_type = case
          when not session.analytics_enabled and excluded.analytics_enabled
            then excluded.device_type else session.device_type end,
        language = case
          when not session.analytics_enabled and excluded.analytics_enabled
            then excluded.language else session.language end,
        client_timezone = case
          when not session.analytics_enabled and excluded.analytics_enabled
            then excluded.client_timezone else session.client_timezone end,
        referral_share_id = case
          when not session.analytics_enabled and excluded.analytics_enabled
            then excluded.referral_share_id else session.referral_share_id end,
        self_referral = case
          when not session.analytics_enabled and excluded.analytics_enabled
            then excluded.self_referral else session.self_referral end,
        last_accounted_at = case
          when not session.analytics_enabled and excluded.analytics_enabled
            then excluded.last_accounted_at else session.last_accounted_at end,
        last_active_accounted_at = case
          when not session.analytics_enabled and excluded.analytics_enabled
            then excluded.last_active_accounted_at
          else session.last_active_accounted_at end,
        updated_at = excluded.updated_at
  returning * into current_session;

  insert into public.analytics_page_views (
    id,
    campaign_id,
    session_id,
    visitor_hash,
    landing_path,
    started_at,
    viewport_width,
    viewport_height,
    screen_width,
    screen_height,
    touch_capable,
    reduced_motion,
    referral_share_id,
    self_referral,
    analytics_enabled,
    created_at
  ) values (
    p_page_view_id,
    campaign.campaign_id,
    current_session.id,
    p_visitor_hash,
    p_landing_path,
    request_time,
    case when campaign.mode = 'active' then p_viewport_width end,
    case when campaign.mode = 'active' then p_viewport_height end,
    case when campaign.mode = 'active' then p_screen_width end,
    case when campaign.mode = 'active' then p_screen_height end,
    case when campaign.mode = 'active' then p_touch end,
    case when campaign.mode = 'active' then p_reduced_motion end,
    case when campaign.mode = 'active' then referral.id end,
    campaign.mode = 'active' and referral_is_self,
    campaign.mode = 'active',
    request_time
  )
  on conflict (id) do nothing;

  if not exists (
    select 1
    from public.analytics_page_views as page_views
    where page_views.id = p_page_view_id
      and page_views.session_id = current_session.id
      and page_views.visitor_hash = p_visitor_hash
  ) then
    raise exception 'page_view_id_conflict' using errcode = '23505';
  end if;

  session_id := current_session.id;
  page_view_id := p_page_view_id;
  expires_at := current_session.expires_at;
  server_time := request_time;
  campaign_id := campaign.campaign_id;
  campaign_status := campaign.mode;
  starts_at := campaign.starts_at;
  ends_at := campaign.ends_at;
  revision := campaign.revision;
  experiment_variant := current_visitor.experiment_variant;
  return next;
end;
$$;

create function public.record_analytics_heartbeat(
  p_visitor_hash text,
  p_session_id uuid,
  p_page_view_id uuid,
  p_sequence bigint,
  p_visible_ms bigint,
  p_active_ms bigint,
  p_max_scroll_percent smallint
)
returns table (
  accepted boolean,
  visible_ms bigint,
  active_ms bigint,
  max_scroll_percent smallint
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
  current_page public.analytics_page_views%rowtype;
  server_page_budget bigint;
  server_session_visible_budget bigint;
  server_session_active_budget bigint;
  requested_visible_delta bigint;
  requested_active_delta bigint;
  credited_visible_delta bigint;
  credited_active_delta bigint;
  accepted_rate_count smallint;
begin
  if p_sequence is null or p_visible_ms is null or p_active_ms is null
    or p_max_scroll_percent is null
    or p_sequence < 1 or p_visible_ms < 0 or p_active_ms < 0
    or p_active_ms > p_visible_ms
    or p_max_scroll_percent not between 0 and 100 then
    raise exception 'invalid_heartbeat' using errcode = '22023';
  end if;

  select * into strict campaign
  from public.campaign_settings
  where singleton
  for share;

  if campaign.mode <> 'active'
    or (campaign.starts_at is not null and request_time < campaign.starts_at)
    or (campaign.ends_at is not null and request_time >= campaign.ends_at) then
    raise exception 'analytics_disabled' using errcode = 'P0001';
  end if;

  select * into current_session
  from public.analytics_sessions
  where id = p_session_id
    and campaign_id = campaign.campaign_id
    and visitor_hash = p_visitor_hash
    and analytics_enabled
  for update;

  if not found or request_time >= current_session.expires_at
    or current_session.session_date <> (request_time at time zone 'Asia/Seoul')::date then
    raise exception 'session_expired' using errcode = 'P0001';
  end if;

  select * into current_page
  from public.analytics_page_views
  where id = p_page_view_id
    and session_id = p_session_id
    and visitor_hash = p_visitor_hash
    and analytics_enabled
  for update;

  if not found then
    raise exception 'invalid_page_view' using errcode = '22023';
  end if;

  -- Refresh the server clock after both row locks. This keeps accounting
  -- timestamps monotonic even when concurrent tabs waited for one another.
  request_time := clock_timestamp();

  if request_time >= current_session.expires_at
    or current_session.session_date <> (request_time at time zone 'Asia/Seoul')::date then
    raise exception 'session_expired' using errcode = 'P0001';
  end if;

  if (campaign.starts_at is not null and request_time < campaign.starts_at)
    or (campaign.ends_at is not null and request_time >= campaign.ends_at) then
    raise exception 'analytics_disabled' using errcode = 'P0001';
  end if;

  if p_sequence <= current_page.heartbeat_sequence
    or p_visible_ms < current_page.client_visible_ms
    or p_active_ms < current_page.client_active_ms
    -- Do not let an attacker poison the monotonic sequence with a far-future
    -- value. The allowance grows faster than the 15-second client cadence, so
    -- a tab that was offline can recover without resetting its page view.
    or p_sequence > greatest(
      10::bigint,
      floor(extract(epoch from (request_time - current_page.started_at)) / 5)::bigint + 10
    ) then
    accepted := false;
    visible_ms := current_page.visible_ms;
    active_ms := current_page.active_ms;
    max_scroll_percent := current_page.max_scroll_percent;
    return next;
    return;
  end if;

  server_page_budget := least(
    30000,
    greatest(
      0,
      floor(extract(epoch from (
        request_time - coalesce(current_page.last_heartbeat_at, current_page.started_at)
      )) * 1000)::bigint + 2000
    )
  );
  requested_visible_delta := p_visible_ms - current_page.client_visible_ms;
  requested_active_delta := p_active_ms - current_page.client_active_ms;

  -- Reject implausible cumulative deltas before touching the rate counter or
  -- any sequence/baseline. A later valid sample can therefore recover from a
  -- forged giant value instead of inheriting a poisoned client baseline.
  if requested_active_delta > requested_visible_delta
    or requested_visible_delta > server_page_budget
    or requested_active_delta > server_page_budget then
    accepted := false;
    visible_ms := current_page.visible_ms;
    active_ms := current_page.active_ms;
    max_scroll_percent := current_page.max_scroll_percent;
    return next;
    return;
  end if;

  insert into public.analytics_rate_buckets as bucket (
    rate_kind,
    subject_key,
    window_started_at,
    request_count,
    updated_at
  ) values (
    'heartbeat',
    p_session_id::text,
    date_trunc('minute', request_time),
    1,
    request_time
  )
  on conflict (rate_kind, subject_key, window_started_at) do update
    set request_count = bucket.request_count + 1,
        updated_at = excluded.updated_at
    where bucket.request_count < 6
  returning bucket.request_count into accepted_rate_count;

  if not found then
    raise exception 'analytics_rate_limited' using errcode = 'P0001';
  end if;

  server_session_visible_budget := least(
    30000,
    greatest(
      0,
      floor(extract(epoch from (request_time - current_session.last_accounted_at)) * 1000)::bigint
    )
  );
  server_session_active_budget := least(
    30000,
    greatest(
      0,
      floor(extract(epoch from (
        request_time - current_session.last_active_accounted_at
      )) * 1000)::bigint
    )
  );
  credited_visible_delta := least(
    requested_visible_delta,
    server_session_visible_budget
  );
  credited_active_delta := least(
    requested_active_delta,
    server_session_active_budget,
    greatest(
      0,
      current_session.visible_ms + credited_visible_delta - current_session.active_ms
    )
  );

  update public.analytics_page_views
  set visible_ms = analytics_page_views.visible_ms + requested_visible_delta,
      active_ms = analytics_page_views.active_ms + requested_active_delta,
      client_visible_ms = p_visible_ms,
      client_active_ms = p_active_ms,
      max_scroll_percent = greatest(
        analytics_page_views.max_scroll_percent,
        p_max_scroll_percent
      ),
      heartbeat_sequence = p_sequence,
      last_heartbeat_at = request_time
  where id = p_page_view_id
  returning analytics_page_views.visible_ms,
            analytics_page_views.active_ms,
            analytics_page_views.max_scroll_percent
    into visible_ms, active_ms, max_scroll_percent;

  update public.analytics_sessions
  set visible_ms = analytics_sessions.visible_ms + credited_visible_delta,
      active_ms = analytics_sessions.active_ms + credited_active_delta,
      last_activity_at = request_time,
      last_accounted_at = case
        when requested_visible_delta > 0 then request_time
        else analytics_sessions.last_accounted_at
      end,
      last_active_accounted_at = case
        when requested_active_delta > 0 then request_time
        else analytics_sessions.last_active_accounted_at
      end,
      updated_at = request_time
  where id = p_session_id;

  accepted := true;
  return next;
end;
$$;

create function public.record_analytics_events(
  p_visitor_hash text,
  p_session_id uuid,
  p_events jsonb
)
returns table (
  accepted_count integer,
  duplicate_count integer
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
  event_item jsonb;
  event_id uuid;
  event_page_view_id uuid;
  event_name public.analytics_event_name;
  event_occurred_at timestamptz;
  event_properties jsonb;
  inserted_rows integer;
  existing_today integer;
  allowed_property_keys text[];
  accepted_rate_count smallint;
begin
  if p_events is null
    or jsonb_typeof(p_events) <> 'array'
    or jsonb_array_length(p_events) not between 1 and 20
    or octet_length(p_events::text) > 16384 then
    raise exception 'invalid_event_batch' using errcode = '22023';
  end if;

  select * into strict campaign
  from public.campaign_settings
  where singleton
  for share;

  if campaign.mode <> 'active'
    or (campaign.starts_at is not null and request_time < campaign.starts_at)
    or (campaign.ends_at is not null and request_time >= campaign.ends_at) then
    raise exception 'analytics_disabled' using errcode = 'P0001';
  end if;

  select * into current_session
  from public.analytics_sessions
  where id = p_session_id
    and campaign_id = campaign.campaign_id
    and visitor_hash = p_visitor_hash
  for update;

  if not found or request_time >= current_session.expires_at
    or current_session.session_date <> (request_time at time zone 'Asia/Seoul')::date then
    raise exception 'session_expired' using errcode = 'P0001';
  end if;

  insert into public.analytics_rate_buckets as bucket (
    rate_kind,
    subject_key,
    window_started_at,
    request_count,
    updated_at
  ) values (
    'events',
    p_session_id::text,
    date_trunc('minute', request_time),
    1,
    request_time
  )
  on conflict (rate_kind, subject_key, window_started_at) do update
    set request_count = bucket.request_count + 1,
        updated_at = excluded.updated_at
    where bucket.request_count < 12
  returning bucket.request_count into accepted_rate_count;

  if not found then
    raise exception 'analytics_rate_limited' using errcode = 'P0001';
  end if;

  select count(*)::integer into existing_today
  from public.analytics_events
  where session_id = p_session_id;

  if existing_today >= 500 then
    raise exception 'analytics_rate_limited' using errcode = 'P0001';
  end if;

  accepted_count := 0;
  duplicate_count := 0;

  for event_item in select value from jsonb_array_elements(p_events)
  loop
    begin
      if jsonb_typeof(event_item) <> 'object'
        or not (event_item ? 'id')
        or not (event_item ? 'eventName')
        or not (event_item ? 'occurredAt') then
        raise exception 'invalid_event' using errcode = '22023';
      end if;

      event_id := (event_item ->> 'id')::uuid;
      event_name := (event_item ->> 'eventName')::public.analytics_event_name;
      event_occurred_at := (event_item ->> 'occurredAt')::timestamptz;
      event_page_view_id := nullif(event_item ->> 'pageViewId', '')::uuid;
      event_properties := coalesce(event_item -> 'properties', '{}'::jsonb);

      allowed_property_keys := case event_name
        when 'section_impression' then array['section']::text[]
        when 'share_card_impression' then array['choice', 'variant']::text[]
        when 'share_cta_clicked' then array['choice', 'variant']::text[]
        when 'share_sheet_resolved' then array['choice', 'method']::text[]
        when 'share_sheet_cancelled' then array['choice', 'method']::text[]
        when 'share_link_copied' then array['choice']::text[]
        when 'share_image_downloaded' then array['choice']::text[]
        when 'referral_banner_impression' then array[]::text[]
        when 'rapid_click_lock_shown' then array['queueLength']::text[]
        when 'rapid_click_lock_confirmed' then array['queueLength']::text[]
        when 'vote_rate_limited' then array['code', 'retryAfterSeconds']::text[]
        when 'vote_request_failed' then array['code']::text[]
      end;

      if jsonb_typeof(event_properties) <> 'object'
        or octet_length(event_properties::text) > 2048
        or (select count(*) from jsonb_object_keys(event_properties))
          <> cardinality(allowed_property_keys)
        or event_occurred_at < current_session.started_at - interval '5 minutes'
        or event_occurred_at > request_time + interval '1 minute' then
        raise exception 'invalid_event' using errcode = '22023';
      end if;

      if exists (
        select 1
        from jsonb_object_keys(event_properties) as property_key
        where not (property_key = any(allowed_property_keys))
      ) then
        raise exception 'invalid_event_properties' using errcode = '22023';
      end if;

      if event_properties ? 'choice'
        and (event_properties ->> 'choice') not in ('dip', 'pour') then
        raise exception 'invalid_event_properties' using errcode = '22023';
      end if;

      if event_properties ? 'variant'
        and (event_properties ->> 'variant') not in ('A', 'B') then
        raise exception 'invalid_event_properties' using errcode = '22023';
      end if;

      if event_properties ? 'section'
        and (event_properties ->> 'section') not in (
          'scoreboard',
          'choice-dip',
          'choice-pour'
        ) then
        raise exception 'invalid_event_properties' using errcode = '22023';
      end if;

      if event_properties ? 'method'
        and (event_properties ->> 'method') <> 'native' then
        raise exception 'invalid_event_properties' using errcode = '22023';
      end if;

      if event_properties ? 'code'
        and (event_properties ->> 'code') not in (
          'RATE_LIMITED',
          'NETWORK_RATE_LIMITED',
          'CAPACITY_EXCEEDED',
          'SERVICE_UNAVAILABLE',
          'CAMPAIGN_ENDED',
          'SESSION_EXPIRED',
          'INVALID_VOTE',
          'CLIENT_ERROR',
          'HTTP_400',
          'HTTP_403',
          'HTTP_404',
          'HTTP_409',
          'HTTP_410',
          'HTTP_413',
          'HTTP_415',
          'HTTP_429',
          'HTTP_500',
          'HTTP_502',
          'HTTP_503',
          'HTTP_504'
        ) then
        raise exception 'invalid_event_properties' using errcode = '22023';
      end if;

      if event_properties ? 'queueLength' then
        if jsonb_typeof(event_properties -> 'queueLength') <> 'number'
          or (event_properties ->> 'queueLength')::numeric
            <> trunc((event_properties ->> 'queueLength')::numeric)
          or (event_properties ->> 'queueLength')::numeric not between 0 and 30 then
          raise exception 'invalid_event_properties' using errcode = '22023';
        end if;
      end if;

      if event_properties ? 'retryAfterSeconds' then
        if jsonb_typeof(event_properties -> 'retryAfterSeconds') <> 'number'
          or (event_properties ->> 'retryAfterSeconds')::numeric
            <> trunc((event_properties ->> 'retryAfterSeconds')::numeric)
          or (event_properties ->> 'retryAfterSeconds')::numeric not between 0 and 60 then
          raise exception 'invalid_event_properties' using errcode = '22023';
        end if;
      end if;

      if exists (
        select 1
        from jsonb_each(event_properties) as property(key, value)
        where jsonb_typeof(property.value) not in ('string', 'number', 'boolean')
          or (
            jsonb_typeof(property.value) = 'string'
            and char_length(property.value #>> '{}') > 64
          )
          or (
            jsonb_typeof(property.value) = 'number'
            and abs((property.value #>> '{}')::numeric) > 1000000
          )
      ) then
        raise exception 'invalid_event_properties' using errcode = '22023';
      end if;

      if event_page_view_id is not null and not exists (
        select 1
        from public.analytics_page_views
        where id = event_page_view_id
          and session_id = p_session_id
          and visitor_hash = p_visitor_hash
          and analytics_enabled
      ) then
        raise exception 'invalid_event_page_view' using errcode = '22023';
      end if;

      if existing_today + accepted_count >= 500 then
        exit;
      end if;

      insert into public.analytics_events (
        id,
        campaign_id,
        session_id,
        page_view_id,
        visitor_hash,
        event_name,
        occurred_at,
        received_at,
        properties
      ) values (
        event_id,
        campaign.campaign_id,
        p_session_id,
        event_page_view_id,
        p_visitor_hash,
        event_name,
        event_occurred_at,
        request_time,
        event_properties
      )
      on conflict (id) do nothing;

      get diagnostics inserted_rows = row_count;
      if inserted_rows = 1 then
        accepted_count := accepted_count + 1;
      else
        duplicate_count := duplicate_count + 1;
      end if;
    exception
      when invalid_text_representation or datetime_field_overflow then
        raise exception 'invalid_event' using errcode = '22023';
    end;
  end loop;

  update public.analytics_sessions
  set last_activity_at = request_time,
      updated_at = request_time
  where id = p_session_id;

  return next;
end;
$$;

revoke all on function public.cast_vote(text, text, public.vote_choice)
  from public, anon, authenticated, service_role;
drop function public.cast_vote(text, text, public.vote_choice);

create function public.cast_vote(
  p_visitor_hash text,
  p_network_hash text,
  p_session_id uuid,
  p_page_view_id uuid,
  p_request_id uuid,
  p_choice public.vote_choice
)
returns table (
  vote_id uuid,
  accepted boolean,
  duplicate boolean,
  choice public.vote_choice
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
  existing_vote public.votes%rowtype;
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
    hashtextextended('vote-request:' || p_visitor_hash || ':' || p_request_id::text, 0)
  );

  select * into existing_vote
  from public.votes
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

  insert into public.votes (
    id,
    campaign_id,
    session_id,
    page_view_id,
    request_id,
    visitor_hash,
    network_hash,
    choice,
    created_at
  ) values (
    new_vote_id,
    campaign.campaign_id,
    p_session_id,
    p_page_view_id,
    p_request_id,
    p_visitor_hash,
    p_network_hash,
    p_choice,
    vote_time
  );

  counter_shard := mod(
    hashtextextended(new_vote_id::text, 0) & 9223372036854775807,
    32
  )::smallint;

  update public.vote_count_shards as shards
  set vote_count = shards.vote_count + 1,
      updated_at = vote_time
  where shards.campaign_id = campaign.campaign_id
    and shards.choice = p_choice
    and shards.shard_id = counter_shard;

  if not found then
    raise exception 'vote_counter_shard_missing' using errcode = 'P0001';
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

create function public.get_public_vote_results()
returns table (
  dip_count bigint,
  pour_count bigint,
  total_count bigint,
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
  with counts as (
    select
      coalesce(sum(shards.vote_count) filter (where shards.choice = 'dip'), 0)::bigint
        as dip_count,
      coalesce(sum(shards.vote_count) filter (where shards.choice = 'pour'), 0)::bigint
        as pour_count
    from public.vote_count_shards as shards
    join public.campaign_settings as current_campaign
      on current_campaign.campaign_id = shards.campaign_id
     and current_campaign.singleton
  )
  select
    counts.dip_count,
    counts.pour_count,
    counts.dip_count + counts.pour_count,
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
  from counts
  cross join public.campaign_settings as settings
  where settings.singleton;
$$;

-- Retain the legacy private result RPC for operational compatibility, but make
-- its global counts constant-cost too. Public HTTP results use the RPC above.
create or replace function public.get_vote_results(p_visitor_hash text)
returns table (
  dip_count bigint,
  pour_count bigint,
  total_count bigint,
  user_choice public.vote_choice
)
language sql
stable
security definer
set search_path = ''
set statement_timeout = '2s'
as $$
  select
    results.dip_count,
    results.pour_count,
    results.total_count,
    (
      select votes.choice
      from public.votes as votes
      where votes.visitor_hash = p_visitor_hash
      order by votes.created_at desc, votes.id desc
      limit 1
    )
  from public.get_public_vote_results() as results;
$$;

create function public.create_share_link(
  p_visitor_hash text,
  p_session_id uuid,
  p_page_view_id uuid,
  p_idempotency_key uuid,
  p_token_hash text,
  p_choice public.vote_choice,
  p_parent_token_hash text default null
)
returns table (
  share_id uuid,
  campaign_id uuid,
  created boolean,
  image_path text,
  dip_count bigint,
  pour_count bigint
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
  current_page public.analytics_page_views%rowtype;
  existing_share public.share_links%rowtype;
  provided_parent_share_id uuid;
  derived_parent_share_id uuid;
  counts record;
  new_share_id uuid := gen_random_uuid();
  recent_share_count integer;
  daily_share_count integer;
begin
  if p_visitor_hash !~ '^[0-9a-f]{64}$'
    or p_token_hash !~ '^[0-9a-f]{64}$'
    or (p_parent_token_hash is not null
      and p_parent_token_hash !~ '^[0-9a-f]{64}$')
    or p_idempotency_key is null then
    raise exception 'invalid_share_request' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      'share-request:' || p_visitor_hash || ':' || p_idempotency_key::text,
      0
    )
  );

  select * into existing_share
  from public.share_links as links
  where links.creator_visitor_hash = p_visitor_hash
    and links.idempotency_key = p_idempotency_key;

  if found then
    share_id := existing_share.id;
    campaign_id := existing_share.campaign_id;
    created := false;
    image_path := existing_share.image_path;
    dip_count := existing_share.dip_count;
    pour_count := existing_share.pour_count;
    return next;
    return;
  end if;

  -- Different idempotency keys from one visitor must still serialize so the
  -- 10/minute and 50/KST-day caps cannot race each other.
  perform pg_advisory_xact_lock(
    hashtextextended('share-visitor:' || p_visitor_hash, 0)
  );

  select * into strict campaign
  from public.campaign_settings
  where singleton
  for share;

  if campaign.mode <> 'active'
    or (campaign.starts_at is not null and request_time < campaign.starts_at)
    or (campaign.ends_at is not null and request_time >= campaign.ends_at) then
    raise exception 'sharing_disabled' using errcode = 'P0001';
  end if;

  select * into current_session
  from public.analytics_sessions as sessions
  where sessions.id = p_session_id
    and sessions.campaign_id = campaign.campaign_id
    and sessions.visitor_hash = p_visitor_hash;

  if not found or request_time >= current_session.expires_at
    or current_session.session_date <> (request_time at time zone 'Asia/Seoul')::date then
    raise exception 'session_expired' using errcode = 'P0001';
  end if;

  select * into current_page
  from public.analytics_page_views as page_views
  where page_views.id = p_page_view_id
    and page_views.session_id = p_session_id
    and page_views.visitor_hash = p_visitor_hash
    and page_views.analytics_enabled;

  if not found then
    raise exception 'invalid_page_view' using errcode = '22023';
  end if;

  derived_parent_share_id := current_page.referral_share_id;

  if p_parent_token_hash is not null then
    select links.id into provided_parent_share_id
    from public.share_links as links
    where links.campaign_id = campaign.campaign_id
      and links.token_hash = p_parent_token_hash;

    if provided_parent_share_id is null
      or provided_parent_share_id is distinct from derived_parent_share_id then
      raise exception 'parent_referral_mismatch' using errcode = '22023';
    end if;
  end if;

  if not exists (
    select 1
    from public.votes as votes
    where votes.campaign_id = campaign.campaign_id
      and votes.visitor_hash = p_visitor_hash
      and votes.choice = p_choice
  ) then
    raise exception 'vote_required' using errcode = 'P0001';
  end if;

  select count(*) filter (
           where links.created_at > request_time - interval '1 minute'
         )::integer,
         count(*) filter (
           where links.created_at >= current_session.session_date::timestamp
             at time zone 'Asia/Seoul'
         )::integer
    into recent_share_count, daily_share_count
  from public.share_links as links
  where links.campaign_id = campaign.campaign_id
    and links.creator_visitor_hash = p_visitor_hash;

  if recent_share_count >= 10 or daily_share_count >= 50 then
    raise exception 'share_rate_limited' using errcode = 'P0001';
  end if;

  select * into strict counts from public.get_public_vote_results();

  insert into public.share_links as inserted (
    id,
    campaign_id,
    creator_visitor_hash,
    session_id,
    page_view_id,
    idempotency_key,
    token_hash,
    choice,
    dip_count,
    pour_count,
    parent_share_id,
    image_path,
    created_at
  ) values (
    new_share_id,
    campaign.campaign_id,
    p_visitor_hash,
    p_session_id,
    p_page_view_id,
    p_idempotency_key,
    p_token_hash,
    p_choice,
    counts.dip_count,
    counts.pour_count,
    derived_parent_share_id,
    null,
    request_time
  )
  returning inserted.id,
            inserted.image_path,
            inserted.dip_count,
            inserted.pour_count
    into share_id, image_path, dip_count, pour_count;

  campaign_id := campaign.campaign_id;
  created := true;
  return next;
end;
$$;

create function public.resolve_share_link(p_token_hash text)
returns table (
  share_id uuid,
  campaign_id uuid,
  choice public.vote_choice,
  dip_count bigint,
  pour_count bigint,
  image_path text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
set statement_timeout = '2s'
as $$
  select
    links.id,
    links.campaign_id,
    links.choice,
    links.dip_count,
    links.pour_count,
    links.image_path,
    links.created_at
  from public.share_links as links
  where p_token_hash ~ '^[0-9a-f]{64}$'
    and links.token_hash = p_token_hash
  limit 1;
$$;

create function public.cleanup_operational_data(
  p_before timestamptz default clock_timestamp() - interval '48 hours'
)
returns integer
language plpgsql
security definer
set search_path = ''
set statement_timeout = '3s'
as $$
declare
  deleted_rows integer;
  deleted_analytics_rows integer;
begin
  if p_before > clock_timestamp() - interval '1 hour' then
    raise exception 'cleanup_boundary_too_recent' using errcode = '22023';
  end if;

  delete from public.vote_rate_buckets
  where window_started_at < p_before;
  get diagnostics deleted_rows = row_count;

  delete from public.analytics_rate_buckets
  where window_started_at < p_before;
  get diagnostics deleted_analytics_rows = row_count;

  return deleted_rows + deleted_analytics_rows;
end;
$$;

-- ---------------------------------------------------------------------------
-- Reporting views (service-role only)
-- ---------------------------------------------------------------------------

create view public.analytics_daily_funnel
with (security_invoker = true)
as
with page_counts as (
  select session_id, count(*)::bigint as page_view_count
  from public.analytics_page_views
  where analytics_enabled
  group by session_id
),
vote_counts as (
  select votes.session_id, count(*)::bigint as vote_count
  from public.votes as votes
  join public.analytics_page_views as page_views
    on page_views.id = votes.page_view_id
   and page_views.analytics_enabled
  where votes.session_id is not null
  group by votes.session_id
),
share_counts as (
  select session_id, count(*)::bigint as share_count
  from public.share_links
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

create view public.analytics_acquisition
with (security_invoker = true)
as
select
  sessions.campaign_id,
  sessions.session_date,
  coalesce(sessions.utm_source, '(direct)') as utm_source,
  coalesce(sessions.utm_medium, '(none)') as utm_medium,
  sessions.utm_campaign,
  sessions.referrer_host,
  count(distinct sessions.visitor_hash)::bigint as visitors,
  count(distinct votes.visitor_hash)::bigint as activated_visitors,
  count(votes.id)::bigint as successful_votes,
  round(
    count(distinct votes.visitor_hash)::numeric
      / nullif(count(distinct sessions.visitor_hash), 0),
    4
  ) as visitor_vote_conversion_rate
from public.analytics_sessions as sessions
left join public.votes as votes
  on votes.session_id = sessions.id
 and exists (
   select 1
   from public.analytics_page_views as vote_page
   where vote_page.id = votes.page_view_id
     and vote_page.analytics_enabled
 )
where sessions.analytics_enabled
group by
  sessions.campaign_id,
  sessions.session_date,
  sessions.utm_source,
  sessions.utm_medium,
  sessions.utm_campaign,
  sessions.referrer_host;

create view public.analytics_engagement
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
      or exists (select 1 from public.share_links where share_links.session_id = sessions.id)
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

create view public.analytics_retention
with (security_invoker = true)
as
with first_days as (
  select campaign_id, visitor_hash, min(session_date) as cohort_date
  from public.analytics_sessions
  where analytics_enabled
  group by campaign_id, visitor_hash
)
select
  first_days.campaign_id,
  first_days.cohort_date,
  count(*)::bigint as cohort_visitors,
  count(*) filter (where d1.visitor_hash is not null)::bigint as d1_returning_visitors,
  count(*) filter (where d2.visitor_hash is not null)::bigint as d2_returning_visitors
from first_days
left join public.analytics_sessions as d1
  on d1.campaign_id = first_days.campaign_id
 and d1.visitor_hash = first_days.visitor_hash
 and d1.session_date = first_days.cohort_date + 1
 and d1.analytics_enabled
left join public.analytics_sessions as d2
  on d2.campaign_id = first_days.campaign_id
 and d2.visitor_hash = first_days.visitor_hash
 and d2.session_date = first_days.cohort_date + 2
 and d2.analytics_enabled
group by first_days.campaign_id, first_days.cohort_date;

create view public.analytics_referral_funnel
with (security_invoker = true)
as
with landing_stats as (
  select
    page_views.referral_share_id as share_id,
    count(*)::bigint as external_arrivals,
    count(distinct page_views.session_id)::bigint as external_referral_sessions,
    count(distinct page_views.visitor_hash)::bigint as external_referral_visitors
  from public.analytics_page_views as page_views
  where page_views.referral_share_id is not null
    and not page_views.self_referral
    and page_views.analytics_enabled
  group by page_views.referral_share_id
),
activated_visitors as (
  select distinct votes.campaign_id, votes.visitor_hash
  from public.votes as votes
  join public.analytics_page_views as page_views
    on page_views.id = votes.page_view_id
   and page_views.analytics_enabled
),
attribution_stats as (
  select
    visitors.initial_referral_share_id as share_id,
    count(*)::bigint as fixed_attributed_visitors,
    count(activated_visitors.visitor_hash)::bigint as referred_activated_visitors
  from public.analytics_visitors as visitors
  left join activated_visitors
    on activated_visitors.campaign_id = visitors.campaign_id
   and activated_visitors.visitor_hash = visitors.visitor_hash
  where visitors.initial_referral_share_id is not null
    and visitors.analytics_enabled
  group by visitors.initial_referral_share_id
),
event_steps as (
  select
    events.campaign_id,
    (events.occurred_at at time zone 'Asia/Seoul')::date as share_date,
    count(*) filter (
      where events.event_name = 'share_card_impression'
    )::bigint as share_card_impressions,
    count(*) filter (
      where events.event_name = 'share_cta_clicked'
    )::bigint as share_cta_clicks
  from public.analytics_events as events
  where events.event_name in ('share_card_impression', 'share_cta_clicked')
  group by
    events.campaign_id,
    (events.occurred_at at time zone 'Asia/Seoul')::date
),
link_steps as (
  select
    links.campaign_id,
    (links.created_at at time zone 'Asia/Seoul')::date as share_date,
    count(*)::bigint as links_created,
    coalesce(sum(landing_stats.external_arrivals), 0)::bigint
      as external_arrivals,
    coalesce(sum(landing_stats.external_referral_sessions), 0)::bigint
      as external_referral_sessions,
    coalesce(sum(landing_stats.external_referral_visitors), 0)::bigint
      as external_referral_visitors,
    coalesce(sum(attribution_stats.fixed_attributed_visitors), 0)::bigint
      as fixed_attributed_visitors,
    coalesce(sum(attribution_stats.referred_activated_visitors), 0)::bigint
      as attributed_successful_votes
  from public.share_links as links
  left join landing_stats on landing_stats.share_id = links.id
  left join attribution_stats on attribution_stats.share_id = links.id
  group by
    links.campaign_id,
    (links.created_at at time zone 'Asia/Seoul')::date
),
activity_days as (
  select campaign_id, share_date from event_steps
  union
  select campaign_id, share_date from link_steps
)
select
  activity_days.campaign_id,
  activity_days.share_date,
  coalesce(event_steps.share_card_impressions, 0)::bigint
    as share_card_impressions,
  coalesce(event_steps.share_cta_clicks, 0)::bigint as share_cta_clicks,
  coalesce(link_steps.links_created, 0)::bigint as links_created,
  coalesce(link_steps.external_arrivals, 0)::bigint as external_arrivals,
  coalesce(link_steps.external_referral_sessions, 0)::bigint
    as external_referral_sessions,
  coalesce(link_steps.external_referral_visitors, 0)::bigint
    as external_referral_visitors,
  coalesce(link_steps.fixed_attributed_visitors, 0)::bigint
    as fixed_attributed_visitors,
  coalesce(link_steps.attributed_successful_votes, 0)::bigint
    as attributed_successful_votes,
  coalesce(link_steps.attributed_successful_votes, 0)::bigint
    as referred_activated_visitors
from activity_days
left join event_steps
  on event_steps.campaign_id = activity_days.campaign_id
 and event_steps.share_date = activity_days.share_date
left join link_steps
  on link_steps.campaign_id = activity_days.campaign_id
 and link_steps.share_date = activity_days.share_date;

create view public.analytics_cta_experiment
with (security_invoker = true)
as
with activated_visitors as (
  select distinct votes.campaign_id, votes.visitor_hash
  from public.votes as votes
  join public.analytics_page_views as page_views
    on page_views.id = votes.page_view_id
   and page_views.analytics_enabled
),
visitor_steps as (
  select
    visitors.campaign_id,
    visitors.experiment_variant,
    count(*)::bigint as visitors,
    count(activated_visitors.visitor_hash)::bigint as activated_visitors
  from public.analytics_visitors as visitors
  left join activated_visitors
    on activated_visitors.campaign_id = visitors.campaign_id
   and activated_visitors.visitor_hash = visitors.visitor_hash
  where visitors.analytics_enabled
  group by visitors.campaign_id, visitors.experiment_variant
),
event_steps as (
  select
    events.campaign_id,
    visitors.experiment_variant,
    count(*) filter (
      where events.event_name = 'share_card_impression'
    )::bigint as share_card_impressions,
    count(*) filter (
      where events.event_name = 'share_cta_clicked'
    )::bigint as share_cta_clicks
  from public.analytics_events as events
  join public.analytics_visitors as visitors
    on visitors.campaign_id = events.campaign_id
   and visitors.visitor_hash = events.visitor_hash
   and visitors.analytics_enabled
  where events.event_name in ('share_card_impression', 'share_cta_clicked')
  group by events.campaign_id, visitors.experiment_variant
),
link_steps as (
  select
    links.campaign_id,
    creators.experiment_variant,
    count(*)::bigint as links_created,
    count(distinct links.creator_visitor_hash)::bigint as sharing_visitors
  from public.share_links as links
  join public.analytics_visitors as creators
    on creators.campaign_id = links.campaign_id
   and creators.visitor_hash = links.creator_visitor_hash
   and creators.analytics_enabled
  group by links.campaign_id, creators.experiment_variant
),
arrival_steps as (
  select
    links.campaign_id,
    creators.experiment_variant,
    count(*)::bigint as external_arrivals
  from public.share_links as links
  join public.analytics_visitors as creators
    on creators.campaign_id = links.campaign_id
   and creators.visitor_hash = links.creator_visitor_hash
   and creators.analytics_enabled
  join public.analytics_page_views as arrivals
    on arrivals.referral_share_id = links.id
   and arrivals.analytics_enabled
   and not arrivals.self_referral
  group by links.campaign_id, creators.experiment_variant
),
attribution_steps as (
  select
    links.campaign_id,
    creators.experiment_variant,
    count(distinct referred.visitor_hash)::bigint as referred_visitors,
    count(distinct activated_visitors.visitor_hash)::bigint
      as attributed_successful_votes
  from public.share_links as links
  join public.analytics_visitors as creators
    on creators.campaign_id = links.campaign_id
   and creators.visitor_hash = links.creator_visitor_hash
   and creators.analytics_enabled
  join public.analytics_visitors as referred
    on referred.initial_referral_share_id = links.id
   and referred.analytics_enabled
  left join activated_visitors
    on activated_visitors.campaign_id = referred.campaign_id
   and activated_visitors.visitor_hash = referred.visitor_hash
  group by links.campaign_id, creators.experiment_variant
)
select
  visitor_steps.campaign_id,
  visitor_steps.experiment_variant,
  visitor_steps.visitors,
  visitor_steps.activated_visitors,
  coalesce(event_steps.share_card_impressions, 0)::bigint
    as share_card_impressions,
  coalesce(event_steps.share_cta_clicks, 0)::bigint as share_cta_clicks,
  coalesce(link_steps.links_created, 0)::bigint as links_created,
  coalesce(link_steps.sharing_visitors, 0)::bigint as sharing_visitors,
  coalesce(arrival_steps.external_arrivals, 0)::bigint as external_arrivals,
  coalesce(attribution_steps.referred_visitors, 0)::bigint as referred_visitors,
  coalesce(attribution_steps.attributed_successful_votes, 0)::bigint
    as attributed_successful_votes
from visitor_steps
left join event_steps
  on event_steps.campaign_id = visitor_steps.campaign_id
 and event_steps.experiment_variant = visitor_steps.experiment_variant
left join link_steps
  on link_steps.campaign_id = visitor_steps.campaign_id
 and link_steps.experiment_variant = visitor_steps.experiment_variant
left join arrival_steps
  on arrival_steps.campaign_id = visitor_steps.campaign_id
 and arrival_steps.experiment_variant = visitor_steps.experiment_variant
left join attribution_steps
  on attribution_steps.campaign_id = visitor_steps.campaign_id
 and attribution_steps.experiment_variant = visitor_steps.experiment_variant;

create view public.analytics_data_quality
with (security_invoker = true)
as
with vote_stats as (
  select
    campaign_id,
    count(*)::bigint as vote_rows,
    count(*) filter (where session_id is not null)::bigint as votes_with_session,
    count(*) filter (where page_view_id is not null)::bigint as votes_with_page_view
  from public.votes
  group by campaign_id
),
event_stats as (
  select
    campaign_id,
    count(*)::bigint as unique_events,
    count(*) filter (
      where event_name in ('vote_rate_limited', 'vote_request_failed')
    )::bigint as client_error_events,
    count(*) filter (where page_view_id is null)::bigint as events_without_page_view
  from public.analytics_events
  group by campaign_id
),
page_view_stats as (
  select
    campaign_id,
    count(*)::bigint as page_views,
    count(*) filter (where last_heartbeat_at is null)::bigint
      as page_views_without_heartbeat
  from public.analytics_page_views
  where analytics_enabled
  group by campaign_id
),
shard_stats as (
  select campaign_id, coalesce(sum(vote_count), 0)::bigint as shard_vote_count
  from public.vote_count_shards
  group by campaign_id
)
select
  settings.campaign_id,
  (clock_timestamp() at time zone 'Asia/Seoul')::date as measured_date,
  coalesce(vote_stats.vote_rows, 0)::bigint as vote_rows,
  coalesce(vote_stats.votes_with_session, 0)::bigint as votes_with_session,
  coalesce(vote_stats.votes_with_page_view, 0)::bigint as votes_with_page_view,
  coalesce(event_stats.unique_events, 0)::bigint as unique_events,
  coalesce(event_stats.client_error_events, 0)::bigint as client_error_events,
  coalesce(event_stats.events_without_page_view, 0)::bigint as events_without_page_view,
  coalesce(page_view_stats.page_views, 0)::bigint as page_views,
  coalesce(page_view_stats.page_views_without_heartbeat, 0)::bigint
    as page_views_without_heartbeat,
  coalesce(shard_stats.shard_vote_count, 0)::bigint as shard_vote_count,
  coalesce(shard_stats.shard_vote_count, 0) = coalesce(vote_stats.vote_rows, 0)
    as shard_count_matches,
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
left join vote_stats on vote_stats.campaign_id = settings.campaign_id
left join event_stats on event_stats.campaign_id = settings.campaign_id
left join page_view_stats on page_view_stats.campaign_id = settings.campaign_id
left join shard_stats on shard_stats.campaign_id = settings.campaign_id
where settings.singleton;

-- Supabase owns the storage schema, so a migration executed through the
-- project API cannot safely alter storage.buckets or storage.objects. The
-- server's service-role Storage API creates and enforces the private
-- `share-cards` bucket (PNG only, 512 KiB maximum) on first use. The browser
-- never receives a Storage credential or a public bucket URL; share images
-- remain available only through the application proxy.

-- ---------------------------------------------------------------------------
-- Public-table RLS and privileges
-- ---------------------------------------------------------------------------

alter table public.campaign_settings enable row level security;
alter table public.campaign_settings_history enable row level security;
alter table public.analytics_visitors enable row level security;
alter table public.analytics_sessions enable row level security;
alter table public.analytics_page_views enable row level security;
alter table public.analytics_events enable row level security;
alter table public.analytics_rate_buckets enable row level security;
alter table public.share_links enable row level security;
alter table public.vote_count_shards enable row level security;

create policy campaign_settings_service_role_only on public.campaign_settings
  for select to service_role using (true);
create policy campaign_settings_history_service_role_only
  on public.campaign_settings_history for select to service_role using (true);
create policy analytics_visitors_service_role_only on public.analytics_visitors
  for all to service_role using (true) with check (true);
create policy analytics_sessions_service_role_only on public.analytics_sessions
  for all to service_role using (true) with check (true);
create policy analytics_page_views_service_role_only on public.analytics_page_views
  for all to service_role using (true) with check (true);
create policy analytics_events_service_role_only on public.analytics_events
  for all to service_role using (true) with check (true);
create policy analytics_rate_buckets_service_role_only
  on public.analytics_rate_buckets
  for all to service_role using (true) with check (true);
create policy share_links_service_role_only on public.share_links
  for all to service_role using (true) with check (true);
create policy vote_count_shards_service_role_only on public.vote_count_shards
  for all to service_role using (true) with check (true);

revoke all on table public.campaign_settings from public, anon, authenticated, service_role;
revoke all on table public.campaign_settings_history from public, anon, authenticated, service_role;
revoke all on table public.analytics_visitors from public, anon, authenticated, service_role;
revoke all on table public.analytics_sessions from public, anon, authenticated, service_role;
revoke all on table public.analytics_page_views from public, anon, authenticated, service_role;
revoke all on table public.analytics_events from public, anon, authenticated, service_role;
revoke all on table public.analytics_rate_buckets from public, anon, authenticated, service_role;
revoke all on table public.share_links from public, anon, authenticated, service_role;
revoke all on table public.vote_count_shards from public, anon, authenticated, service_role;

grant select on table public.campaign_settings to service_role;
grant select on table public.campaign_settings_history to service_role;
grant select, insert, update on table public.analytics_visitors to service_role;
grant select, insert, update on table public.analytics_sessions to service_role;
grant select, insert, update on table public.analytics_page_views to service_role;
grant select, insert on table public.analytics_events to service_role;
grant select, insert, update, delete on table public.analytics_rate_buckets to service_role;
grant select, insert, update on table public.share_links to service_role;
grant select, insert, update on table public.vote_count_shards to service_role;

revoke all on table public.analytics_daily_funnel from public, anon, authenticated;
revoke all on table public.analytics_acquisition from public, anon, authenticated;
revoke all on table public.analytics_engagement from public, anon, authenticated;
revoke all on table public.analytics_retention from public, anon, authenticated;
revoke all on table public.analytics_referral_funnel from public, anon, authenticated;
revoke all on table public.analytics_cta_experiment from public, anon, authenticated;
revoke all on table public.analytics_data_quality from public, anon, authenticated;

grant select on table public.analytics_daily_funnel to service_role;
grant select on table public.analytics_acquisition to service_role;
grant select on table public.analytics_engagement to service_role;
grant select on table public.analytics_retention to service_role;
grant select on table public.analytics_referral_funnel to service_role;
grant select on table public.analytics_cta_experiment to service_role;
grant select on table public.analytics_data_quality to service_role;

revoke all on function public.set_campaign_window(
  timestamptz, timestamptz, public.campaign_mode, text
) from public, anon, authenticated;
revoke all on function public.get_campaign_status() from public, anon, authenticated;
revoke all on function public.bootstrap_daily_session(
  text, text, uuid, text, text, text, text, text, text, text, text, text,
  text, text, text, text, integer, integer, integer, integer, boolean, boolean, text
) from public, anon, authenticated;
revoke all on function public.record_analytics_heartbeat(
  text, uuid, uuid, bigint, bigint, bigint, smallint
) from public, anon, authenticated;
revoke all on function public.record_analytics_events(text, uuid, jsonb)
  from public, anon, authenticated;
revoke all on function public.cast_vote(
  text, text, uuid, uuid, uuid, public.vote_choice
) from public, anon, authenticated;
revoke all on function public.get_public_vote_results()
  from public, anon, authenticated;
revoke all on function public.create_share_link(
  text, uuid, uuid, uuid, text, public.vote_choice, text
) from public, anon, authenticated;
revoke all on function public.resolve_share_link(text)
  from public, anon, authenticated;
revoke all on function public.cleanup_operational_data(timestamptz)
  from public, anon, authenticated;

grant execute on function public.set_campaign_window(
  timestamptz, timestamptz, public.campaign_mode, text
) to service_role;
grant execute on function public.get_campaign_status() to service_role;
grant execute on function public.bootstrap_daily_session(
  text, text, uuid, text, text, text, text, text, text, text, text, text,
  text, text, text, text, integer, integer, integer, integer, boolean, boolean, text
) to service_role;
grant execute on function public.record_analytics_heartbeat(
  text, uuid, uuid, bigint, bigint, bigint, smallint
) to service_role;
grant execute on function public.record_analytics_events(text, uuid, jsonb)
  to service_role;
grant execute on function public.cast_vote(
  text, text, uuid, uuid, uuid, public.vote_choice
) to service_role;
grant execute on function public.get_public_vote_results() to service_role;
grant execute on function public.get_vote_results(text) to service_role;
grant execute on function public.create_share_link(
  text, uuid, uuid, uuid, text, public.vote_choice, text
) to service_role;
grant execute on function public.resolve_share_link(text) to service_role;
grant execute on function public.cleanup_operational_data(timestamptz)
  to service_role;

-- ---------------------------------------------------------------------------
-- Transactional verification: fail deployment if boundaries or counters drift.
-- ---------------------------------------------------------------------------

do $verification$
declare
  checked_table text;
  checked_function text;
  current_campaign_id uuid;
  shard_total bigint;
  vote_total bigint;
begin
  select campaign_id into strict current_campaign_id
  from public.campaign_settings where singleton;

  select count(*) into shard_total
  from public.vote_count_shards
  where campaign_id = current_campaign_id;

  if shard_total <> 64 then
    raise exception 'Expected exactly 64 vote counter shards, found %', shard_total;
  end if;

  select coalesce(sum(vote_count), 0) into shard_total
  from public.vote_count_shards
  where campaign_id = current_campaign_id;

  select count(*) into vote_total
  from public.votes
  where campaign_id = current_campaign_id;

  if shard_total <> vote_total then
    raise exception 'Vote shard backfill mismatch: shards %, votes %', shard_total, vote_total;
  end if;

  foreach checked_table in array array[
    'campaign_settings',
    'campaign_settings_history',
    'analytics_visitors',
    'analytics_sessions',
    'analytics_page_views',
    'analytics_events',
    'analytics_rate_buckets',
    'share_links',
    'vote_count_shards'
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
    'public.set_campaign_window(timestamp with time zone,timestamp with time zone,public.campaign_mode,text)',
    'public.get_campaign_status()',
    'public.bootstrap_daily_session(text,text,uuid,text,text,text,text,text,text,text,text,text,text,text,text,text,integer,integer,integer,integer,boolean,boolean,text)',
    'public.record_analytics_heartbeat(text,uuid,uuid,bigint,bigint,bigint,smallint)',
    'public.record_analytics_events(text,uuid,jsonb)',
    'public.cast_vote(text,text,uuid,uuid,uuid,public.vote_choice)',
    'public.get_public_vote_results()',
    'public.create_share_link(text,uuid,uuid,uuid,text,public.vote_choice,text)',
    'public.resolve_share_link(text)',
    'public.cleanup_operational_data(timestamp with time zone)'
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

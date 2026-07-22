begin;

-- Mirrors public.share_links (the binary dip/pour share system), kept fully
-- parallel so the team-voting feature never touches binary tables. dip_count
-- and pour_count don't generalize to 10 teams, so this stores the chosen
-- team's count and the campaign total instead.
create table public.team_share_links (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaign_settings (campaign_id),
  creator_visitor_hash text not null,
  session_id uuid not null references public.analytics_sessions (id),
  page_view_id uuid not null references public.analytics_page_views (id),
  idempotency_key uuid not null,
  token_hash text not null unique,
  choice public.team_choice not null,
  vote_count bigint not null check (vote_count >= 0),
  total_count bigint not null check (total_count >= 0),
  image_path text,
  created_at timestamptz not null default clock_timestamp(),
  constraint team_share_links_creator_hash_format
    check (creator_visitor_hash ~ '^[0-9a-f]{64}$'),
  constraint team_share_links_token_hash_format
    check (token_hash ~ '^[0-9a-f]{64}$'),
  constraint team_share_links_idempotency
    unique (campaign_id, creator_visitor_hash, idempotency_key),
  constraint team_share_links_image_path_format check (
    image_path is null
    or (
      image_path ~ '^[0-9a-fA-F-]{36}\.png$'
      and char_length(image_path) <= 64
    )
  )
);

create index team_share_links_creator_created_idx
  on public.team_share_links (creator_visitor_hash, created_at desc);

alter table public.team_share_links enable row level security;
revoke all on table public.team_share_links from public, anon, authenticated, service_role;
grant select, insert, update on table public.team_share_links to service_role;
create policy team_share_links_service_role_only on public.team_share_links
  for all to service_role using (true) with check (true);

-- create_team_share_link(...) mirrors create_share_link exactly, minus the
-- parent/referral chaining (team shares don't wire into the referral-
-- attribution columns on analytics_sessions/analytics_page_views, which are
-- FK'd to share_links specifically -- extending that is out of scope here;
-- the /r/[token] landing page still works for team share links, it just
-- doesn't feed back into acquisition analytics the way binary shares do).
create function public.create_team_share_link(
  p_visitor_hash text,
  p_session_id uuid,
  p_page_view_id uuid,
  p_idempotency_key uuid,
  p_token_hash text,
  p_choice public.team_choice
)
returns table (
  share_id uuid,
  campaign_id uuid,
  created boolean,
  image_path text,
  vote_count bigint,
  total_count bigint
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
  existing_share public.team_share_links%rowtype;
  new_share_id uuid := gen_random_uuid();
  recent_share_count integer;
  daily_share_count integer;
  chosen_count bigint;
  campaign_total bigint;
begin
  if p_visitor_hash !~ '^[0-9a-f]{64}$'
    or p_token_hash !~ '^[0-9a-f]{64}$'
    or p_idempotency_key is null then
    raise exception 'invalid_share_request' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      'team-share-request:' || p_visitor_hash || ':' || p_idempotency_key::text,
      0
    )
  );

  select * into existing_share
  from public.team_share_links as links
  where links.creator_visitor_hash = p_visitor_hash
    and links.idempotency_key = p_idempotency_key;

  if found then
    share_id := existing_share.id;
    campaign_id := existing_share.campaign_id;
    created := false;
    image_path := existing_share.image_path;
    vote_count := existing_share.vote_count;
    total_count := existing_share.total_count;
    return next;
    return;
  end if;

  -- Different idempotency keys from one visitor must still serialize so the
  -- 10/minute and 50/KST-day caps cannot race each other.
  perform pg_advisory_xact_lock(
    hashtextextended('team-share-visitor:' || p_visitor_hash, 0)
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

  if not exists (
    select 1
    from public.team_votes as votes
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
  from public.team_share_links as links
  where links.campaign_id = campaign.campaign_id
    and links.creator_visitor_hash = p_visitor_hash;

  if recent_share_count >= 10 or daily_share_count >= 50 then
    raise exception 'share_rate_limited' using errcode = 'P0001';
  end if;

  select coalesce(sum(shards.vote_count), 0)::bigint into campaign_total
  from public.team_vote_shards as shards
  where shards.campaign_id = campaign.campaign_id;

  select coalesce(sum(shards.vote_count), 0)::bigint into chosen_count
  from public.team_vote_shards as shards
  where shards.campaign_id = campaign.campaign_id
    and shards.choice = p_choice;

  insert into public.team_share_links as inserted (
    id,
    campaign_id,
    creator_visitor_hash,
    session_id,
    page_view_id,
    idempotency_key,
    token_hash,
    choice,
    vote_count,
    total_count,
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
    chosen_count,
    campaign_total,
    null,
    request_time
  )
  returning inserted.id,
            inserted.image_path,
            inserted.vote_count,
            inserted.total_count
    into share_id, image_path, vote_count, total_count;

  campaign_id := campaign.campaign_id;
  created := true;
  return next;
end;
$$;

revoke all on function public.create_team_share_link(text, uuid, uuid, uuid, text, public.team_choice)
  from public, anon, authenticated;
grant execute on function public.create_team_share_link(text, uuid, uuid, uuid, text, public.team_choice)
  to service_role;

create function public.resolve_team_share_link(p_token_hash text)
returns table (
  share_id uuid,
  campaign_id uuid,
  choice public.team_choice,
  vote_count bigint,
  total_count bigint,
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
    links.vote_count,
    links.total_count,
    links.image_path,
    links.created_at
  from public.team_share_links as links
  where p_token_hash ~ '^[0-9a-f]{64}$'
    and links.token_hash = p_token_hash
  limit 1;
$$;

revoke all on function public.resolve_team_share_link(text) from public, anon, authenticated;
grant execute on function public.resolve_team_share_link(text) to service_role;

do $verification$
begin
  if not exists (
    select 1
    from pg_catalog.pg_class as classes
    join pg_catalog.pg_namespace as namespaces
      on namespaces.oid = classes.relnamespace
    where namespaces.nspname = 'public'
      and classes.relname = 'team_share_links'
      and classes.relrowsecurity
  ) then
    raise exception 'RLS is not enabled on public.team_share_links';
  end if;

  if has_table_privilege('anon', 'public.team_share_links', 'SELECT')
    or has_table_privilege('anon', 'public.team_share_links', 'INSERT')
    or has_table_privilege('authenticated', 'public.team_share_links', 'SELECT')
    or has_table_privilege('authenticated', 'public.team_share_links', 'INSERT') then
    raise exception 'Non-service role can access public.team_share_links';
  end if;

  if to_regprocedure('public.create_team_share_link(text,uuid,uuid,uuid,text,public.team_choice)') is null then
    raise exception 'Required RPC is missing: create_team_share_link';
  end if;
  if to_regprocedure('public.resolve_team_share_link(text)') is null then
    raise exception 'Required RPC is missing: resolve_team_share_link';
  end if;

  if has_function_privilege('anon', 'public.create_team_share_link(text,uuid,uuid,uuid,text,public.team_choice)', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.create_team_share_link(text,uuid,uuid,uuid,text,public.team_choice)', 'EXECUTE')
    or not has_function_privilege('service_role', 'public.create_team_share_link(text,uuid,uuid,uuid,text,public.team_choice)', 'EXECUTE') then
    raise exception 'Unexpected RPC privileges: create_team_share_link';
  end if;

  if has_function_privilege('anon', 'public.resolve_team_share_link(text)', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.resolve_team_share_link(text)', 'EXECUTE')
    or not has_function_privilege('service_role', 'public.resolve_team_share_link(text)', 'EXECUTE') then
    raise exception 'Unexpected RPC privileges: resolve_team_share_link';
  end if;
end
$verification$;

commit;

begin;

-- campaign_settings is a hard singleton (`unique check (singleton)`), so
-- there is no existing way to represent "past topics" as distinct rows.
-- topic_history is a separate archive table: when the live topic changes,
-- archive_current_topic_and_reset() snapshots the final tally into a new row
-- here and resets the singleton campaign's shard counters to zero so the
-- next topic starts from scratch. Individual `votes` rows are never touched,
-- so no audit data is lost.

create table public.topic_history (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaign_settings (campaign_id),
  title text not null,
  option_a_label text not null,
  option_a_choice public.vote_choice not null,
  option_a_count bigint not null default 0 check (option_a_count >= 0),
  option_b_label text not null,
  option_b_choice public.vote_choice not null,
  option_b_count bigint not null default 0 check (option_b_count >= 0),
  starts_at timestamptz,
  ends_at timestamptz,
  archived_at timestamptz not null default clock_timestamp(),
  reason text not null,
  constraint topic_history_title_length check (char_length(title) between 1 and 200),
  constraint topic_history_option_a_label_length
    check (char_length(option_a_label) between 1 and 60),
  constraint topic_history_option_b_label_length
    check (char_length(option_b_label) between 1 and 60),
  constraint topic_history_reason_length check (char_length(reason) between 1 and 500),
  constraint topic_history_choices_distinct check (option_a_choice <> option_b_choice)
);

create index topic_history_archived_at_idx on public.topic_history (archived_at desc);

alter table public.topic_history enable row level security;
revoke all on table public.topic_history from anon, authenticated;
grant select, insert on table public.topic_history to service_role;

create policy topic_history_service_role_only
  on public.topic_history
  for all
  to service_role
  using (true)
  with check (true);

-- ---------------------------------------------------------------------------
-- archive_current_topic_and_reset: service-role-only, run manually (SQL
-- editor / db:push follow-up) at the moment a new topic goes live.
-- ---------------------------------------------------------------------------

create function public.archive_current_topic_and_reset(
  p_title text,
  p_option_a_label text,
  p_option_a_choice public.vote_choice,
  p_option_b_label text,
  p_option_b_choice public.vote_choice,
  p_reason text
)
returns table (
  id uuid,
  campaign_id uuid,
  title text,
  option_a_label text,
  option_a_choice public.vote_choice,
  option_a_count bigint,
  option_b_label text,
  option_b_choice public.vote_choice,
  option_b_count bigint,
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
  a_count bigint;
  b_count bigint;
  new_id uuid := gen_random_uuid();
  archived_time timestamptz := clock_timestamp();
begin
  if p_option_a_choice = p_option_b_choice then
    raise exception 'invalid_topic_options' using errcode = '22023';
  end if;

  if char_length(btrim(coalesce(p_title, ''))) not between 1 and 200
    or char_length(btrim(coalesce(p_option_a_label, ''))) not between 1 and 60
    or char_length(btrim(coalesce(p_option_b_label, ''))) not between 1 and 60
    or char_length(btrim(coalesce(p_reason, ''))) not between 1 and 500 then
    raise exception 'invalid_topic_archive_request' using errcode = '22023';
  end if;

  select * into strict campaign
  from public.campaign_settings
  where singleton
  for update;

  select
    coalesce(sum(shards.vote_count) filter (where shards.choice = p_option_a_choice), 0),
    coalesce(sum(shards.vote_count) filter (where shards.choice = p_option_b_choice), 0)
    into a_count, b_count
  from public.vote_count_shards as shards
  where shards.campaign_id = campaign.campaign_id;

  insert into public.topic_history (
    id, campaign_id, title,
    option_a_label, option_a_choice, option_a_count,
    option_b_label, option_b_choice, option_b_count,
    starts_at, ends_at, archived_at, reason
  ) values (
    new_id, campaign.campaign_id, btrim(p_title),
    btrim(p_option_a_label), p_option_a_choice, a_count,
    btrim(p_option_b_label), p_option_b_choice, b_count,
    campaign.starts_at, campaign.ends_at, archived_time, btrim(p_reason)
  );

  update public.vote_count_shards as shards
  set vote_count = 0,
      updated_at = archived_time
  where shards.campaign_id = campaign.campaign_id;

  id := new_id;
  campaign_id := campaign.campaign_id;
  title := btrim(p_title);
  option_a_label := btrim(p_option_a_label);
  option_a_choice := p_option_a_choice;
  option_a_count := a_count;
  option_b_label := btrim(p_option_b_label);
  option_b_choice := p_option_b_choice;
  option_b_count := b_count;
  starts_at := campaign.starts_at;
  ends_at := campaign.ends_at;
  archived_at := archived_time;
  reason := btrim(p_reason);
  return next;
end;
$$;

revoke all on function public.archive_current_topic_and_reset(
  text, text, public.vote_choice, text, public.vote_choice, text
) from public, anon, authenticated;
grant execute on function public.archive_current_topic_and_reset(
  text, text, public.vote_choice, text, public.vote_choice, text
) to service_role;

create function public.list_public_topic_history(p_limit integer default 10)
returns table (
  id uuid,
  title text,
  option_a_label text,
  option_a_choice public.vote_choice,
  option_a_count bigint,
  option_b_label text,
  option_b_choice public.vote_choice,
  option_b_count bigint,
  starts_at timestamptz,
  ends_at timestamptz,
  archived_at timestamptz
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
    topics.option_a_label,
    topics.option_a_choice,
    topics.option_a_count,
    topics.option_b_label,
    topics.option_b_choice,
    topics.option_b_count,
    topics.starts_at,
    topics.ends_at,
    topics.archived_at
  from public.topic_history as topics
  order by topics.archived_at desc
  limit greatest(1, least(coalesce(p_limit, 10), 50));
$$;

revoke all on function public.list_public_topic_history(integer)
  from public, anon, authenticated;
grant execute on function public.list_public_topic_history(integer)
  to service_role;

do $verification$
declare
  checked_function text;
begin
  if not exists (
    select 1
    from pg_catalog.pg_class as classes
    join pg_catalog.pg_namespace as namespaces
      on namespaces.oid = classes.relnamespace
    where namespaces.nspname = 'public'
      and classes.relname = 'topic_history'
      and classes.relrowsecurity
  ) then
    raise exception 'RLS is not enabled on public.topic_history';
  end if;

  if has_table_privilege('anon', 'public.topic_history', 'SELECT')
    or has_table_privilege('anon', 'public.topic_history', 'INSERT')
    or has_table_privilege('authenticated', 'public.topic_history', 'SELECT')
    or has_table_privilege('authenticated', 'public.topic_history', 'INSERT') then
    raise exception 'Non-service role can access public.topic_history';
  end if;

  foreach checked_function in array array[
    'public.archive_current_topic_and_reset(text,text,public.vote_choice,text,public.vote_choice,text)',
    'public.list_public_topic_history(integer)'
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

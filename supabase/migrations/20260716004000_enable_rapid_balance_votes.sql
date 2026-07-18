begin;

-- Votes are now events: one visitor can express a choice repeatedly.
alter table public.comments
  drop constraint if exists comments_vote_fk;

alter table public.votes
  drop constraint if exists votes_one_per_visitor,
  drop constraint if exists votes_visitor_choice_key;

-- Each row is one anonymized network/IP and one UTC second. The primary key
-- gives the upsert below a row lock, making the 15-vote cap atomic.
create table public.vote_rate_buckets (
  network_hash text not null,
  window_started_at timestamptz not null,
  vote_count smallint not null default 1,
  updated_at timestamptz not null default now(),
  primary key (network_hash, window_started_at),
  constraint vote_rate_buckets_network_hash_format
    check (network_hash ~ '^[0-9a-f]{64}$'),
  constraint vote_rate_buckets_count_range
    check (vote_count between 1 and 15)
);

create index vote_rate_buckets_expiry_idx
  on public.vote_rate_buckets (window_started_at);

alter table public.vote_rate_buckets enable row level security;
revoke all on table public.vote_rate_buckets from anon, authenticated;
grant select, insert, update, delete on table public.vote_rate_buckets to service_role;

create policy vote_rate_buckets_service_role_only
  on public.vote_rate_buckets
  for all
  to service_role
  using (true)
  with check (true);

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
as $$
  select
    count(*) filter (where votes.choice = 'dip')::bigint as dip_count,
    count(*) filter (where votes.choice = 'pour')::bigint as pour_count,
    count(*)::bigint as total_count,
    (
      select own_vote.choice
      from public.votes as own_vote
      where own_vote.visitor_hash = p_visitor_hash
      order by own_vote.created_at desc, own_vote.id desc
      limit 1
    ) as user_choice
  from public.votes as votes;
$$;

revoke all on function public.cast_vote(text, text, public.vote_choice)
  from public, anon, authenticated, service_role;
drop function public.cast_vote(text, text, public.vote_choice);

create function public.cast_vote(
  p_visitor_hash text,
  p_network_hash text,
  p_choice public.vote_choice
)
returns table (
  dip_count bigint,
  pour_count bigint,
  total_count bigint,
  user_choice public.vote_choice
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  vote_time timestamptz := clock_timestamp();
  rate_window timestamptz := date_trunc('second', vote_time);
  accepted_vote_count smallint;
begin
  if p_visitor_hash !~ '^[0-9a-f]{64}$'
    or p_network_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid anonymous identity hash' using errcode = '22023';
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
  returning vote_count into accepted_vote_count;

  if not found then
    raise exception 'network_vote_rate_limited' using errcode = 'P0001';
  end if;

  insert into public.votes (visitor_hash, network_hash, choice, created_at)
  values (p_visitor_hash, p_network_hash, p_choice, vote_time);

  return query
    select * from public.get_vote_results(p_visitor_hash);
end;
$$;

revoke all on function public.cast_vote(text, text, public.vote_choice)
  from public, anon, authenticated;
grant execute on function public.cast_vote(text, text, public.vote_choice)
  to service_role;

do $verification$
begin
  if to_regclass('public.vote_rate_buckets') is null
    or to_regprocedure('public.cast_vote(text,text,public.vote_choice)') is null then
    raise exception 'Rapid vote rate-limit schema is missing';
  end if;

  if exists (
    select 1
    from pg_constraint
    where conrelid = 'public.votes'::regclass
      and conname in ('votes_one_per_visitor', 'votes_visitor_choice_key')
  ) then
    raise exception 'Legacy one-vote constraints are still present';
  end if;

  if has_function_privilege(
      'anon',
      'public.cast_vote(text,text,public.vote_choice)',
      'EXECUTE'
    )
    or has_function_privilege(
      'authenticated',
      'public.cast_vote(text,text,public.vote_choice)',
      'EXECUTE'
    )
    or not has_function_privilege(
      'service_role',
      'public.cast_vote(text,text,public.vote_choice)',
      'EXECUTE'
    ) then
    raise exception 'Unexpected cast_vote permissions';
  end if;
end
$verification$;

commit;

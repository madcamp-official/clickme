begin;

create type public.vote_choice as enum ('dip', 'pour');

create type public.comment_attempt_outcome as enum (
  'pending',
  'invalid',
  'rate_limited',
  'vote_required',
  'moderation_rejected',
  'moderation_unavailable',
  'accepted',
  'database_error'
);

create table public.votes (
  id uuid primary key default gen_random_uuid(),
  visitor_hash text not null,
  choice public.vote_choice not null,
  created_at timestamptz not null default now(),
  constraint votes_visitor_hash_format check (visitor_hash ~ '^[0-9a-f]{64}$'),
  constraint votes_one_per_visitor unique (visitor_hash),
  constraint votes_visitor_choice_key unique (visitor_hash, choice)
);

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  visitor_hash text not null,
  choice public.vote_choice not null,
  body text not null,
  created_at timestamptz not null default now(),
  constraint comments_visitor_hash_format check (visitor_hash ~ '^[0-9a-f]{64}$'),
  constraint comments_body_length check (char_length(body) between 1 and 240),
  constraint comments_vote_fk
    foreign key (visitor_hash, choice)
    references public.votes (visitor_hash, choice)
    on delete cascade
);

create table public.comment_attempts (
  id uuid primary key default gen_random_uuid(),
  visitor_hash text not null,
  outcome public.comment_attempt_outcome not null default 'pending',
  detail_code text,
  created_at timestamptz not null default now(),
  constraint comment_attempts_visitor_hash_format check (visitor_hash ~ '^[0-9a-f]{64}$'),
  constraint comment_attempts_detail_code_length check (
    detail_code is null or char_length(detail_code) between 1 and 64
  )
);

create index votes_choice_idx on public.votes (choice);
create index comments_created_at_idx on public.comments (created_at desc);
create index comment_attempts_visitor_created_idx
  on public.comment_attempts (visitor_hash, created_at desc);

alter table public.votes enable row level security;
alter table public.comments enable row level security;
alter table public.comment_attempts enable row level security;

revoke all on table public.votes from anon, authenticated;
revoke all on table public.comments from anon, authenticated;
revoke all on table public.comment_attempts from anon, authenticated;

grant select, insert on table public.votes to service_role;
grant select, insert on table public.comments to service_role;
grant select, insert, update on table public.comment_attempts to service_role;

create policy votes_service_role_only
  on public.votes
  for all
  to service_role
  using (true)
  with check (true);

create policy comments_service_role_only
  on public.comments
  for all
  to service_role
  using (true)
  with check (true);

create policy comment_attempts_service_role_only
  on public.comment_attempts
  for all
  to service_role
  using (true)
  with check (true);

create function public.get_vote_results(p_visitor_hash text)
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
    ) as user_choice
  from public.votes as votes;
$$;

create function public.cast_vote(
  p_visitor_hash text,
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
begin
  if p_visitor_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid visitor hash' using errcode = '22023';
  end if;

  insert into public.votes (visitor_hash, choice)
  values (p_visitor_hash, p_choice);

  return query
    select * from public.get_vote_results(p_visitor_hash);
end;
$$;

create function public.claim_comment_attempt(p_visitor_hash text)
returns table (
  attempt_id uuid,
  allowed boolean,
  retry_after_seconds integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  attempt_time timestamptz := clock_timestamp();
  recent_attempt_count integer;
  oldest_recent_attempt timestamptz;
begin
  if p_visitor_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid visitor hash' using errcode = '22023';
  end if;

  -- Serialize claims for one visitor so concurrent requests cannot exceed the limit.
  perform pg_advisory_xact_lock(hashtextextended(p_visitor_hash, 0));

  select count(*)::integer, min(created_at)
    into recent_attempt_count, oldest_recent_attempt
  from public.comment_attempts
  where visitor_hash = p_visitor_hash
    and created_at > attempt_time - interval '10 minutes';

  insert into public.comment_attempts (visitor_hash, created_at)
  values (p_visitor_hash, attempt_time)
  returning id into attempt_id;

  allowed := recent_attempt_count < 5;
  retry_after_seconds := case
    when allowed then 0
    else greatest(
      1,
      ceil(extract(epoch from (
        oldest_recent_attempt + interval '10 minutes' - attempt_time
      )))::integer
    )
  end;

  return next;
end;
$$;

revoke all on function public.get_vote_results(text) from public, anon, authenticated;
revoke all on function public.cast_vote(text, public.vote_choice) from public, anon, authenticated;
revoke all on function public.claim_comment_attempt(text) from public, anon, authenticated;

grant execute on function public.get_vote_results(text) to service_role;
grant execute on function public.cast_vote(text, public.vote_choice) to service_role;
grant execute on function public.claim_comment_attempt(text) to service_role;

commit;

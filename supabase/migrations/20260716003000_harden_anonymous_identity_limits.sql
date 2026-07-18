begin;

-- Cookies can be deleted, so keep anonymous abuse bounded by a second,
-- server-derived HMAC that never stores the source IP address itself.
alter table public.votes
  add column network_hash text;

update public.votes
set network_hash = visitor_hash
where network_hash is null;

alter table public.votes
  alter column network_hash set not null,
  add constraint votes_network_hash_format
    check (network_hash ~ '^[0-9a-f]{64}$');

create index votes_network_created_idx
  on public.votes (network_hash, created_at desc);

alter table public.comment_attempts
  add column network_hash text;

update public.comment_attempts
set network_hash = visitor_hash
where network_hash is null;

alter table public.comment_attempts
  alter column network_hash set not null,
  add constraint comment_attempts_network_hash_format
    check (network_hash ~ '^[0-9a-f]{64}$');

create index comment_attempts_network_created_idx
  on public.comment_attempts (network_hash, created_at desc);

revoke all on function public.cast_vote(text, public.vote_choice)
  from public, anon, authenticated, service_role;
drop function public.cast_vote(text, public.vote_choice);

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
  recent_network_votes integer;
begin
  if p_visitor_hash !~ '^[0-9a-f]{64}$'
    or p_network_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid anonymous identity hash' using errcode = '22023';
  end if;

  -- Serialize one network bucket so parallel requests cannot race the cap.
  perform pg_advisory_xact_lock(
    hashtextextended('vote-network:' || p_network_hash, 0)
  );

  select count(*)::integer
    into recent_network_votes
  from public.votes
  where network_hash = p_network_hash
    and created_at > vote_time - interval '1 hour';

  -- This is deliberately a generous abuse ceiling, not a claim that one IP
  -- equals one person. The visitor cookie still enforces the normal UX rule.
  if recent_network_votes >= 120 then
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

revoke all on function public.claim_comment_attempt(text)
  from public, anon, authenticated, service_role;
drop function public.claim_comment_attempt(text);

create function public.claim_comment_attempt(
  p_visitor_hash text,
  p_network_hash text
)
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
  visitor_attempt_count integer;
  network_attempt_count integer;
  oldest_visitor_attempt timestamptz;
  oldest_network_attempt timestamptz;
  visitor_retry integer := 0;
  network_retry integer := 0;
begin
  if p_visitor_hash !~ '^[0-9a-f]{64}$'
    or p_network_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid anonymous identity hash' using errcode = '22023';
  end if;

  -- Network lock first and visitor lock second for a consistent lock order.
  perform pg_advisory_xact_lock(
    hashtextextended('comment-network:' || p_network_hash, 0)
  );
  perform pg_advisory_xact_lock(
    hashtextextended('comment-visitor:' || p_visitor_hash, 0)
  );

  delete from public.comment_attempts
  where created_at < attempt_time - interval '30 days';

  select count(*)::integer, min(created_at)
    into visitor_attempt_count, oldest_visitor_attempt
  from public.comment_attempts
  where visitor_hash = p_visitor_hash
    and outcome <> 'rate_limited'
    and created_at > attempt_time - interval '10 minutes';

  select count(*)::integer, min(created_at)
    into network_attempt_count, oldest_network_attempt
  from public.comment_attempts
  where network_hash = p_network_hash
    and outcome <> 'rate_limited'
    and created_at > attempt_time - interval '10 minutes';

  allowed := visitor_attempt_count < 5 and network_attempt_count < 50;

  if allowed then
    insert into public.comment_attempts (
      visitor_hash,
      network_hash,
      created_at
    ) values (
      p_visitor_hash,
      p_network_hash,
      attempt_time
    )
    returning id into attempt_id;

    retry_after_seconds := 0;
  else
    -- Bound rejected audit growth even if a caller repeatedly deletes cookies.
    select id
      into attempt_id
    from public.comment_attempts
    where network_hash = p_network_hash
      and outcome = 'rate_limited'
      and created_at > attempt_time - interval '1 minute'
    order by created_at desc
    limit 1;

    if attempt_id is null then
      insert into public.comment_attempts (
        visitor_hash,
        network_hash,
        outcome,
        detail_code,
        created_at
      ) values (
        p_visitor_hash,
        p_network_hash,
        'rate_limited',
        'RATE_LIMITED',
        attempt_time
      )
      returning id into attempt_id;
    end if;

    if visitor_attempt_count >= 5 then
      visitor_retry := greatest(
        1,
        ceil(extract(epoch from (
          oldest_visitor_attempt + interval '10 minutes' - attempt_time
        )))::integer
      );
    end if;

    if network_attempt_count >= 50 then
      network_retry := greatest(
        1,
        ceil(extract(epoch from (
          oldest_network_attempt + interval '10 minutes' - attempt_time
        )))::integer
      );
    end if;

    retry_after_seconds := greatest(visitor_retry, network_retry, 1);
  end if;

  return next;
end;
$$;

revoke all on function public.claim_comment_attempt(text, text)
  from public, anon, authenticated;
grant execute on function public.claim_comment_attempt(text, text)
  to service_role;

do $verification$
begin
  if to_regprocedure('public.cast_vote(text,text,public.vote_choice)') is null
    or to_regprocedure('public.claim_comment_attempt(text,text)') is null then
    raise exception 'Hardened anonymous voting RPCs are missing';
  end if;

  if to_regprocedure('public.cast_vote(text,public.vote_choice)') is not null
    or to_regprocedure('public.claim_comment_attempt(text)') is not null then
    raise exception 'Legacy anonymous voting RPCs must be removed';
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
    or has_function_privilege(
      'anon',
      'public.claim_comment_attempt(text,text)',
      'EXECUTE'
    )
    or has_function_privilege(
      'authenticated',
      'public.claim_comment_attempt(text,text)',
      'EXECUTE'
    ) then
    raise exception 'A non-service role can execute a hardened private RPC';
  end if;

  if not has_function_privilege(
      'service_role',
      'public.cast_vote(text,text,public.vote_choice)',
      'EXECUTE'
    )
    or not has_function_privilege(
      'service_role',
      'public.claim_comment_attempt(text,text)',
      'EXECUTE'
    ) then
    raise exception 'service_role cannot execute a hardened private RPC';
  end if;
end
$verification$;

commit;

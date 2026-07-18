begin;

create index if not exists comment_attempts_created_at_idx
  on public.comment_attempts (created_at);

create or replace function public.claim_comment_attempt(p_visitor_hash text)
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

  -- Serialize claims for one visitor so concurrent requests cannot exceed the
  -- limit. Rejected requests do not extend the window indefinitely.
  perform pg_advisory_xact_lock(hashtextextended(p_visitor_hash, 0));

  -- Keep audit data bounded without requiring an external scheduler.
  delete from public.comment_attempts
  where created_at < attempt_time - interval '30 days';

  select count(*)::integer, min(created_at)
    into recent_attempt_count, oldest_recent_attempt
  from public.comment_attempts
  where visitor_hash = p_visitor_hash
    and outcome <> 'rate_limited'
    and created_at > attempt_time - interval '10 minutes';

  allowed := recent_attempt_count < 5;

  if allowed then
    insert into public.comment_attempts (visitor_hash, created_at)
    values (p_visitor_hash, attempt_time)
    returning id into attempt_id;

    retry_after_seconds := 0;
  else
    -- Record at most one rejected audit row per minute for a visitor. This
    -- preserves evidence without allowing a tight retry loop to grow the table
    -- without bound.
    select id
      into attempt_id
    from public.comment_attempts
    where visitor_hash = p_visitor_hash
      and outcome = 'rate_limited'
      and created_at > attempt_time - interval '1 minute'
    order by created_at desc
    limit 1;

    if attempt_id is null then
      insert into public.comment_attempts (
        visitor_hash,
        outcome,
        detail_code,
        created_at
      ) values (
        p_visitor_hash,
        'rate_limited',
        'RATE_LIMITED',
        attempt_time
      )
      returning id into attempt_id;
    end if;

    retry_after_seconds := greatest(
      1,
      ceil(extract(epoch from (
        oldest_recent_attempt + interval '10 minutes' - attempt_time
      )))::integer
    );
  end if;

  return next;
end;
$$;

commit;

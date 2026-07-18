-- Fail the deployment transaction if the security boundary created by the
-- preceding migration is incomplete. This migration intentionally leaves no
-- application objects behind; its successful history entry is the audit trail.
do $verification$
declare
  checked_role text;
  checked_table text;
begin
  if (
    select count(*)
    from pg_catalog.pg_class as classes
    join pg_catalog.pg_namespace as namespaces on namespaces.oid = classes.relnamespace
    where namespaces.nspname = 'public'
      and classes.relname in ('votes', 'comments', 'comment_attempts')
      and classes.relkind = 'r'
      and classes.relrowsecurity
  ) <> 3 then
    raise exception 'Voting tables must all exist with RLS enabled';
  end if;

  foreach checked_role in array array['anon', 'authenticated']
  loop
    foreach checked_table in array array['votes', 'comments', 'comment_attempts']
    loop
      if has_table_privilege(checked_role, format('public.%I', checked_table), 'SELECT')
        or has_table_privilege(checked_role, format('public.%I', checked_table), 'INSERT')
        or has_table_privilege(checked_role, format('public.%I', checked_table), 'UPDATE')
        or has_table_privilege(checked_role, format('public.%I', checked_table), 'DELETE')
        or has_table_privilege(checked_role, format('public.%I', checked_table), 'TRUNCATE')
        or has_table_privilege(checked_role, format('public.%I', checked_table), 'REFERENCES')
        or has_table_privilege(checked_role, format('public.%I', checked_table), 'TRIGGER') then
        raise exception '% has an unintended privilege on public.%', checked_role, checked_table;
      end if;
    end loop;
  end loop;

  if not has_table_privilege('service_role', 'public.votes', 'SELECT')
    or not has_table_privilege('service_role', 'public.votes', 'INSERT')
    or not has_table_privilege('service_role', 'public.comments', 'SELECT')
    or not has_table_privilege('service_role', 'public.comments', 'INSERT')
    or not has_table_privilege('service_role', 'public.comment_attempts', 'SELECT')
    or not has_table_privilege('service_role', 'public.comment_attempts', 'INSERT')
    or not has_table_privilege('service_role', 'public.comment_attempts', 'UPDATE') then
    raise exception 'service_role is missing a required voting table privilege';
  end if;

  if (
    select count(*)
    from pg_catalog.pg_policies
    where schemaname = 'public'
      and policyname in (
        'votes_service_role_only',
        'comments_service_role_only',
        'comment_attempts_service_role_only'
      )
      and 'service_role' = any(roles)
  ) <> 3 then
    raise exception 'Expected service_role-only RLS policies were not created';
  end if;

  if to_regprocedure('public.get_vote_results(text)') is null
    or to_regprocedure('public.cast_vote(text,public.vote_choice)') is null
    or to_regprocedure('public.claim_comment_attempt(text)') is null then
    raise exception 'A required voting RPC is missing';
  end if;

  if has_function_privilege('anon', 'public.get_vote_results(text)', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.get_vote_results(text)', 'EXECUTE')
    or has_function_privilege('anon', 'public.cast_vote(text,public.vote_choice)', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.cast_vote(text,public.vote_choice)', 'EXECUTE')
    or has_function_privilege('anon', 'public.claim_comment_attempt(text)', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.claim_comment_attempt(text)', 'EXECUTE') then
    raise exception 'A non-service role can execute a private voting RPC';
  end if;

  if not has_function_privilege('service_role', 'public.get_vote_results(text)', 'EXECUTE')
    or not has_function_privilege('service_role', 'public.cast_vote(text,public.vote_choice)', 'EXECUTE')
    or not has_function_privilege('service_role', 'public.claim_comment_attempt(text)', 'EXECUTE') then
    raise exception 'service_role is missing a required voting RPC privilege';
  end if;
end
$verification$;

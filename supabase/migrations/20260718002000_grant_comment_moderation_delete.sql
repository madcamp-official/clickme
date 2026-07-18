begin;

-- comments only ever had select+insert. Add delete so an operator can remove
-- a moderation violation via the service-role key (SQL Editor or a direct
-- REST call), matching how ad-hoc moderation is documented to work: no
-- public delete endpoint, service-role only. RLS already allows this via the
-- existing `comments_service_role_only` `for all` policy from 20260716000000;
-- only the table grant was missing.
grant delete on table public.comments to service_role;

do $verification$
begin
  if not has_table_privilege('service_role', 'public.comments', 'DELETE') then
    raise exception 'service_role cannot delete from public.comments';
  end if;

  if has_table_privilege('anon', 'public.comments', 'DELETE')
    or has_table_privilege('authenticated', 'public.comments', 'DELETE') then
    raise exception 'Non-service role can delete from public.comments';
  end if;
end
$verification$;

commit;

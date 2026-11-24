create function public.require_external_student() returns void
language sql stable security definer set search_path = '' as $$
  select private.require_community_student();
$$;
revoke all on function public.require_external_student() from public, anon;
grant execute on function public.require_external_student() to authenticated;

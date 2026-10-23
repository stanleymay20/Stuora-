-- Gen-3 audit D-10 (export half): a student can download the personal data
-- Stuora holds about them (GDPR Art. 15 access / Art. 20 portability).
-- Scope is strictly the caller's own records: messages they SENT (not other
-- people's replies), groups they belong to, reports they FILED (not reports
-- about them, which would expose reporters), notices addressed to them.
-- Account deletion is a server function (supabase/functions/delete-account),
-- because removing the Auth user and Storage objects needs the service role.
begin;

create function public.export_my_data()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor uuid := (select auth.uid()); v_email text;
begin
  if actor is null then
    raise exception 'Sign in to export your data' using errcode = '42501';
  end if;
  -- FK-free window: works before a profile exists (reviewer finding: consume_action
  -- references profiles and failed with 23503 for profile-less accounts).
  if not private.bump_service_window('export_student_day', actor::text, 5, interval '1 day') then
    raise exception 'You can download your data up to 5 times a day' using errcode = 'P0001';
  end if;
  -- to_jsonb keeps this portable to schemas where auth.users lacks columns.
  select to_jsonb(u) ->> 'email' into v_email from auth.users u where u.id = actor;
  return jsonb_build_object(
    'generated_at', now(),
    'account', jsonb_build_object('id', actor, 'email', v_email),
    'profile', (select to_jsonb(p) from public.profiles p where p.id = actor),
    'listings', coalesce((select jsonb_agg(jsonb_build_object(
        'listing', to_jsonb(l),
        'housing_details', (select to_jsonb(h) from public.housing_details h where h.listing_id = l.id),
        'marketplace_details', (select to_jsonb(m) from public.marketplace_details m where m.listing_id = l.id),
        'photos', coalesce((select jsonb_agg(jsonb_build_object('object_path', lm.object_path, 'created_at', lm.created_at))
                              from public.listing_media lm where lm.listing_id = l.id), '[]'::jsonb))
        order by l.created_at)
      from public.listings l where l.owner_id = actor), '[]'::jsonb),
    'saved_listings', coalesce((select jsonb_agg(jsonb_build_object('listing_id', s.listing_id, 'created_at', s.created_at))
      from public.saved_listings s where s.user_id = actor), '[]'::jsonb),
    'conversations', coalesce((select jsonb_agg(jsonb_build_object(
        'conversation_id', c.id, 'title', c.title, 'listing_id', c.listing_id, 'joined_at', cm.joined_at))
      from public.conversation_members cm join public.conversations c on c.id = cm.conversation_id
      where cm.user_id = actor), '[]'::jsonb),
    'messages_sent', coalesce((select jsonb_agg(jsonb_build_object(
        'conversation_id', m.conversation_id, 'body', m.body, 'created_at', m.created_at) order by m.created_at)
      from public.messages m where m.sender_id = actor), '[]'::jsonb),
    'group_memberships', coalesce((select jsonb_agg(jsonb_build_object(
        'group_id', g.id, 'name', g.name, 'owner', g.owner_id = actor, 'joined_at', gm.joined_at))
      from public.student_group_members gm join public.student_groups g on g.id = gm.group_id
      where gm.user_id = actor), '[]'::jsonb),
    'group_posts', coalesce((select jsonb_agg(jsonb_build_object(
        'group_id', gp.group_id, 'body', gp.body, 'created_at', gp.created_at) order by gp.created_at)
      from public.student_group_messages gp where gp.author_id = actor), '[]'::jsonb),
    'reports_filed', coalesce((select jsonb_agg(jsonb_build_object(
        'reason', r.reason, 'details', r.details, 'status', r.status, 'created_at', r.created_at))
      from public.reports r where r.reporter_id = actor), '[]'::jsonb),
    'blocked_users', coalesce((select jsonb_agg(jsonb_build_object('blocked_id', b.blocked_id, 'created_at', b.created_at))
      from public.user_blocks b where b.blocker_id = actor), '[]'::jsonb),
    'moderation_notices', coalesce((select jsonb_agg(jsonb_build_object(
        'kind', n.kind, 'message', n.message, 'created_at', n.created_at))
      from public.moderation_notices n where n.user_id = actor), '[]'::jsonb),
    'suspension', (select jsonb_build_object('reason', s.reason, 'suspended_at', s.suspended_at)
      from public.account_suspensions s where s.user_id = actor)
  );
end;
$$;
revoke all on function public.export_my_data() from public, anon;
grant execute on function public.export_my_data() to authenticated;

commit;

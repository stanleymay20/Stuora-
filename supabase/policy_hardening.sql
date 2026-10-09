begin;

-- A conversation creator must be able to read the conversation before the
-- first membership row exists, otherwise the creator cannot add members.
drop policy if exists "conversations_read_member" on public.conversations;

create policy "conversations_read_creator_or_member"
on public.conversations for select
to authenticated
using (
  creator_id = (select auth.uid())
  or exists (
    select 1 from public.conversation_members cm
    where cm.conversation_id = id and cm.user_id = (select auth.uid())
  )
);

-- A listing's ownership and domain kind are immutable from public clients.
-- Students can edit content/status, but cannot turn a marketplace row into a
-- job/housing record or transfer ownership by changing identity columns.
revoke update on public.listings from authenticated;
grant update (status, title, description, city, price_cents, currency)
on public.listings to authenticated;

commit;
